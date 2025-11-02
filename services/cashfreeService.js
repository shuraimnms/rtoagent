const axios = require('axios');
const crypto = require('crypto');
const Settings = require('../models/Settings');

class CashfreeService {
  constructor() {
    this.baseUrl = null;
    this.appId = null;
    this.secretKey = null;
    this.callbackUrl = null;
    this.isProduction = false;
  }

  async initialize() {
    try {
      const settings = await Settings.findOne();
      if (!settings || !settings.cashfree) {
        throw new Error('Cashfree settings not configured');
      }

      // Determine environment: use paymentIntegration.environment if available, else fallback to cashfree.isProduction
      const environment = settings.paymentIntegration?.environment || (settings.cashfree.isProduction ? 'production' : 'sandbox');

      // Set baseUrl based on environment
      this.baseUrl = environment === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
      this.isProduction = environment === 'production';

      this.appId = settings.cashfree.appId;
      this.secretKey = settings.cashfree.secretKey;
      this.callbackUrl = settings.cashfree.callbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/api/v1/webhook/cashfree`;

      if (!this.appId || !this.secretKey) {
        throw new Error('Cashfree API credentials not configured');
      }
    } catch (error) {
      console.error('Cashfree service initialization error:', error);
      throw error;
    }
  }

  generateOrderId() {
    return `CF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSignature(orderId, orderAmount, orderCurrency = 'INR') {
    const data = `${orderId}${orderAmount}${orderCurrency}${this.callbackUrl}`;
    return crypto.createHmac('sha256', this.secretKey).update(data).digest('base64');
  }

  async createOrder(orderData) {
    await this.initialize();

    const { orderId, orderAmount, customerDetails, orderMeta } = orderData;

    const payload = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: customerDetails.customerId,
        customer_email: customerDetails.email,
        customer_phone: customerDetails.phone,
        customer_name: customerDetails.name
      },
      order_meta: {
        return_url: this.isProduction ? `https://rtoagent.netlify.app/payment-success?order_id={order_id}` : `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success?order_id={order_id}`,
        notify_url: this.callbackUrl,
        payment_methods: 'cc,dc,nb,upi'
      },
      order_tags: {
        source: 'wallet_topup'
      }
    };

    try {
      const response = await axios.post(`${this.baseUrl}/orders`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': '2022-09-01',
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey
        }
      });

      return {
        success: true,
        orderId: response.data.order_id,
        paymentSessionId: response.data.payment_session_id,
        paymentLink: response.data.payment_link,
        data: response.data
      };
    } catch (error) {
      console.error('Cashfree order creation error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getOrderStatus(orderId) {
    await this.initialize();

    try {
      const response = await axios.get(`${this.baseUrl}/orders/${orderId}`, {
        headers: {
          'x-api-version': '2022-09-01',
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey
        }
      });

      return {
        success: true,
        orderId: response.data.order_id,
        orderStatus: response.data.order_status,
        paymentStatus: response.data.payment_status || 'UNKNOWN',
        data: response.data
      };
    } catch (error) {
      console.error('Cashfree order status check error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  verifyWebhookSignature(rawBody, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(rawBody)
        .digest('base64');

      return signature === expectedSignature;
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }

  async processWebhook(webhookData) {
    try {
      const { orderId, orderAmount, paymentStatus, paymentMessage } = webhookData;

      // Update transaction status based on payment status
      let status = 'pending';
      if (paymentStatus === 'SUCCESS') {
        status = 'success';
      } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
        status = 'failed';
      }

      return {
        orderId,
        amount: orderAmount,
        status,
        gatewayResponse: webhookData
      };
    } catch (error) {
      console.error('Webhook processing error:', error);
      throw error;
    }
  }
}

module.exports = new CashfreeService();
