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
      const environment = settings.paymentIntegration?.environment || (settings.cashfree?.isProduction ? 'production' : 'sandbox');

      // Set baseUrl based on environment, using configured URLs from settings
      this.baseUrl = environment === 'production'
        ? (settings.cashfree.productionBaseUrl || 'https://api.cashfree.com/pg')
        : (settings.cashfree.sandboxBaseUrl || 'https://sandbox.cashfree.com/pg');
      this.isProduction = environment === 'production';

      this.appId = settings.cashfree.appId;
      this.secretKey = settings.cashfree.secretKey;
      this.callbackUrl = settings.cashfree.callbackUrl || `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/v1/pay/webhook`; // Use backend URL for webhook

      // Override with localhost for development
      if (process.env.NODE_ENV !== 'production') {
        this.callbackUrl = 'http://localhost:3000/api/v1/pay/webhook';
      }

      console.log('CashfreeService Initialized with Callback URL:', this.callbackUrl);

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
        return_url: `https://rtoagent.netlify.app/payment-success?order_id={order_id}`,
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

      console.log('🔍 Cashfree Order Status Raw:', response.data);

      // Check for failure indicators in the response
      const orderStatus = response.data.order_status;
      let paymentStatus = response.data.payment_status || 'UNKNOWN';

      // If order is failed but payment status is unknown, mark as failed
      if (orderStatus === 'FAILED' && paymentStatus === 'UNKNOWN') {
        paymentStatus = 'FAILED';
      }

      return {
        success: true,
        orderId: response.data.order_id,
        orderStatus: orderStatus,
        paymentStatus: paymentStatus,
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
      // Handle different webhook data structures
      let orderId, orderAmount, paymentStatus;

      if (webhookData.data) {
        // New structure with data wrapper
        const data = webhookData.data;
        if (data.order) {
          orderId = data.order.order_id;
          orderAmount = data.order.order_amount;
          paymentStatus = data.payment?.payment_status || data.order.order_status;
        } else {
          // Direct data structure
          orderId = data.orderId || data.order_id;
          orderAmount = data.orderAmount || data.order_amount;
          paymentStatus = data.paymentStatus || data.payment_status;
        }
      } else {
        // Legacy structure
        orderId = webhookData.orderId || webhookData.order_id;
        orderAmount = webhookData.orderAmount || webhookData.order_amount;
        paymentStatus = webhookData.paymentStatus || webhookData.payment_status;
      }

      // Update transaction status based on payment status
      let status = 'pending';
      if (paymentStatus === 'SUCCESS' || paymentStatus === 'success' || paymentStatus === 'PAID' || paymentStatus === 'COMPLETED') {
        status = 'success';
      } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED' || paymentStatus === 'failed') {
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
