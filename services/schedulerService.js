const cron = require('node-cron');
const Reminder = require('../models/Reminder');
const MessageLog = require('../models/MessageLog');
const UnsubscribeList = require('../models/UnsubscribeList');
const Agent = require('../models/Agent');
const msg91Service = require('./msg91Service');
const fetch = require('node-fetch'); // Import node-fetch for making HTTP requests

class SchedulerService {
  constructor() {
    this.isRunning = false;
  }

  start() {
    // Schedule reminders at multiple times during the day
    // 9:30 AM
    cron.schedule('30 9 * * *', () => {
      this.processPendingReminders();
    });

    // 11:30 AM
    cron.schedule('30 11 * * *', () => {
      this.processPendingReminders();
    });

    // 2:30 PM
    cron.schedule('30 14 * * *', () => {
      this.processPendingReminders();
    });

    // 5:00 PM
    cron.schedule('0 17 * * *', () => {
      this.processPendingReminders();
    });

    // 7:00 PM
    cron.schedule('0 19 * * *', () => {
      this.processPendingReminders();
    });

    cron.schedule('0 * * * *', () => {
      this.retryFailedMessages();
    });

    // Schedule a task to ping the server's health endpoint every 30 minutes to keep it awake on platforms like Render
    cron.schedule('*/30 * * * *', async () => {
      try {
        if (!process.env.APP_BASE_URL) {
          console.warn('APP_BASE_URL is not defined. Skipping periodic self-ping.');
          return;
        }
        const response = await fetch(`${process.env.APP_BASE_URL}/health`);
        if (response.ok) {
          console.log('Periodic self-ping to health endpoint successful.');
        } else {
          console.error(`Periodic self-ping to health endpoint failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error during periodic self-ping:', error);
      }
    });

    console.log('Scheduler started successfully');
  }

  async processPendingReminders() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const pendingReminders = await Reminder.find({
        next_send_date: { $lte: now },
        status: { $in: ['PENDING', 'FAILED'] }
      }).populate('customer').populate('agent');

      for (const reminder of pendingReminders) {
        await this.processReminder(reminder);
      }
    } catch (error) {
      console.error('Scheduler Error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async processReminder(reminder) {
    try {
      const isUnsubscribed = await UnsubscribeList.findOne({
        mobile: reminder.customer.mobile
      });

      if (isUnsubscribed) {
        reminder.status = 'CANCELLED';
        await reminder.save();
        return;
      }

      if (reminder.agent.wallet_balance < reminder.agent.settings.per_message_cost) {
        console.log(`Insufficient balance for agent: ${reminder.agent.email}`);
        return;
      }

      const variables = this.prepareMessageVariables(reminder);

      const result = await msg91Service.sendTemplateMessage({
        mobile: reminder.customer.mobile,
        template_name: reminder.reminder_type,
        variables: variables,
        agent: reminder.agent
      });

      const messageLog = new MessageLog({
        reminder: reminder._id,
        customer_mobile: reminder.customer.mobile,
        template_name: reminder.reminder_type,
        variables_sent: Object.values(variables),
        provider_message_id: result.provider_message_id,
        provider_response: result.provider_response,
        status: result.success ? 'DELIVERED' : 'FAILED',
        sent_at: new Date(),
        delivered_at: result.success ? new Date() : null,
        cost: reminder.agent.settings.per_message_cost,
        error_message: result.success ? null : (typeof result.error === 'object' ? JSON.stringify(result.error) : result.error),
        agent: reminder.agent._id
      });

      await messageLog.save();

      if (result.success) {
        await Agent.findByIdAndUpdate(reminder.agent._id, {
          $inc: { wallet_balance: -reminder.agent.settings.per_message_cost }
        });

        reminder.sent_count += 1;
        reminder.last_sent_date = new Date();

        const sentDates = reminder.scheduled_dates.filter(date => date <= new Date());
        const remainingDates = reminder.scheduled_dates.filter(date => date > new Date());

        if (remainingDates.length > 0) {
          reminder.next_send_date = remainingDates[0];
          reminder.status = 'PENDING';
        } else {
          reminder.next_send_date = null;
          reminder.status = 'COMPLETED';
        }
      } else {
        reminder.status = 'FAILED';
      }

      await reminder.save();

    } catch (error) {
      console.error(`Error processing reminder ${reminder._id}:`, error);
      reminder.status = 'FAILED';
      await reminder.save();
    }
  }

  prepareMessageVariables(reminder) {
    const expiryDate = new Date(reminder.expiry_date);
    const today = new Date();
    const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

    const baseVars = {
      customer_name: reminder.customer.name,
      expiry_date: expiryDate.toLocaleDateString('en-IN'),
      days_left: daysLeft.toString(),
      agent_name: reminder.agent.name,
      agent_mobile: reminder.agent.mobile
    };

    switch (reminder.reminder_type) {
      case 'driving_license_reminder':
        return {
          ...baseVars,
          vehicle_type: reminder.vehicle_type || 'Vehicle',
          license_number: reminder.license_number || 'N/A'
        };
      case 'fitness_certificate_reminder':
      case 'puc_certificate_reminder':
      case 'road_tax_reminder':
      case 'noc_hypothecation_reminder':
      case 'vehicle_insurance_reminder':
        return {
          ...baseVars,
          vehicle_number: reminder.vehicle_number || reminder.customer.vehicle_number
        };
      default:
        return baseVars;
    }
  }

  async retryFailedMessages() {
    try {
      const failedLogs = await MessageLog.find({
        status: 'FAILED',
        retry_count: { $lt: 3 },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).populate('reminder');

      for (const log of failedLogs) {
        await this.retryMessage(log);
      }
    } catch (error) {
      console.error('Retry Error:', error);
    }
  }

  async retryMessage(messageLog) {
    try {
      const reminder = await Reminder.findById(messageLog.reminder)
        .populate('customer')
        .populate('agent');

      if (!reminder) return;

      const result = await msg91Service.sendTemplateMessage({
        mobile: reminder.customer.mobile,
        template_name: messageLog.template_name,
        variables: this.prepareMessageVariables(reminder),
        agent: reminder.agent
      });

      messageLog.retry_count += 1;

      if (result.success) {
        messageLog.status = 'DELIVERED';
        messageLog.sent_at = new Date();
        messageLog.delivered_at = new Date();
        messageLog.provider_message_id = result.provider_message_id;

        await Agent.findByIdAndUpdate(reminder.agent._id, {
          $inc: { wallet_balance: -reminder.agent.settings.per_message_cost }
        });
      }

      await messageLog.save();

    } catch (error) {
      console.error(`Retry failed for message ${messageLog._id}:`, error);
    }
  }
}

module.exports = new SchedulerService();
