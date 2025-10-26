const crypto = require('crypto');
const axios = require('axios');

class JOJOUPIService {
  constructor() {
    this.apiKey = process.env.JOJOUPI_API_KEY || '17f13317ce1ea927ccedb77fa3732b61';
    this.baseURL = process.env.JOJOUPI_BASE_URL || 'https://upi.jojopay.in';
    this.callbackURL = process.env.JOJOUPI_CALLBACK_URL || `${process.env.BASE_URL}/api/v1/webhook/jojoupi`;
  }

  /**
   * Create payment link for wallet top-up
   */
  async createPaymentLink(agent, amount, purpose = 'Wallet Top-up') {
    try {
      const orderId = `RTO_${agent._id}_${Date.now()}`;
      
      const payload = {
        key: this.apiKey,
        client_txn_id: orderId,
        amount: Math.round(amount).toString(), // Ensure integer amount
        purpose: purpose,
        customer_name: agent.name,
        customer_email: agent.email,
        customer_mobile: agent.mobile,
        redirect_url: `${process.env.BASE_URL}/api/v1/payment/success`,
        callback_url: this.callbackURL
      };

      console.log('JOJOUPI Payment Request:', payload);

      const response = await axios.post(`${this.baseURL}/api/v1/order`, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('JOJOUPI Payment Response:', response.data);

      if (response.data.status === true) {
        return {
          success: true,
          payment_url: response.data.data.payment_url,
          order_id: orderId,
          qr_code: response.data.data.qr_code,
          response: response.data
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Payment link creation failed'
        };
      }
    } catch (error) {
      console.error('JOJOUPI Payment Error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Verify payment status
   */
  async verifyPayment(orderId) {
    try {
      const response = await axios.get(`${this.baseURL}/api/v1/order/status`, {
        params: {
          key: this.apiKey,
          client_txn_id: orderId
        }
      });

      console.log('JOJOUPI Verification Response:', response.data);

      if (response.data.status === true) {
        return {
          success: true,
          status: response.data.data.status,
          amount: response.data.data.amount,
          utr: response.data.data.utr,
          transaction_date: response.data.data.transaction_date,
          response: response.data
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Payment verification failed'
        };
      }
    } catch (error) {
      console.error('JOJOUPI Verification Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      // JOJOUPI might send signature verification
      // Adjust based on their documentation
      const generatedSignature = crypto
        .createHmac('sha256', this.apiKey)
        .update(JSON.stringify(payload))
        .digest('hex');
      
      return generatedSignature === signature;
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Handle webhook callback
   */
  async handleWebhook(payload) {
    try {
      console.log('JOJOUPI Webhook Received:', payload);

      const {
        user,
        orderid,
        amount,
        txn_status,
        utr_number,
        received_from,
        date,
        api_txn_id,
        transactions_id
      } = payload;

      // Extract agent ID from order ID (format: RTO_agentId_timestamp)
      const orderParts = orderid.split('_');
      if (orderParts.length < 3 || orderParts[0] !== 'RTO') {
        throw new Error('Invalid order ID format');
      }

      const agentId = orderParts[1];

      return {
        success: true,
        agentId,
        orderId: orderid,
        amount: parseFloat(amount),
        status: txn_status,
        utr: utr_number,
        receivedFrom: received_from,
        transactionDate: date,
        apiTxnId: api_txn_id,
        transactionId: transactions_id
      };

    } catch (error) {
      console.error('Webhook handling error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new JOJOUPIService();