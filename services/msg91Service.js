const axios = require('axios');
const Settings = require('../models/Settings');

class MSG91Service {
  constructor() {
    // Remove initialization from constructor to make it dynamic
    this.namespace = process.env.MSG91_NAMESPACE || '6f1facc7_b2a9_445b_bc84_1ae0ea345726';
    this.baseURL = 'https://api.msg91.com/api/v5/whatsapp';
  }

  // Helper to get the latest settings from DB
  async getLatestConfig() {
    const settings = await Settings.findOne().lean();
    if (settings && settings.msg91) {
      return {
        authKey: settings.msg91.authKey?.trim(),
        integratedNumber: settings.msg91.senderId?.trim()
      };
    }
    // Fallback to environment variables if DB settings are not found
    return {
      authKey: process.env.MSG91_AUTH_KEY?.trim(),
      integratedNumber: (process.env.MSG91_SENDER_ID || '15558887633')?.trim()
    };
  }

  async sendTemplateMessage({ mobile, template_name, variables, agent }) {
    try {
      const config = await this.getLatestConfig();

      const payload = {
        integrated_number: config.integratedNumber,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: template_name,
            language: {
              code: "en",
              policy: "deterministic"
            },
            namespace: this.namespace,
            to_and_components: [
              {
                to: [mobile],
                components: this.buildComponents(variables, template_name, agent)
              }
            ]
          }
        }
      };

      console.log('📤 MSG91 API Request:', {
        url: `${this.baseURL}/whatsapp-outbound-message/bulk/`,
        payload: payload
      });

      const response = await axios.post(`${this.baseURL}/whatsapp-outbound-message/bulk/`, payload, {
        headers: {
          'authkey': config.authKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log('✅ MSG91 API Response:', response.data);

      return {
        success: true,
        provider_message_id: response.data.message_id || response.data.request_id,
        provider_response: response.data
      };

    } catch (error) {
      console.error('❌ MSG91 API Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  buildComponents(variables, template_name, agent) {
    const baseVariables = {
      customer_name: variables.customer_name || 'Customer',
      vehicle_number: variables.vehicle_number || 'N/A',
      vehicle_type: variables.vehicle_type || 'Vehicle',
      license_number: variables.license_number || 'N/A',
      expiry_date: variables.expiry_date || 'N/A',
      days_left: variables.days_left || '0',
      agent_name: agent?.name || 'Shuraim RTO',
      agent_mobile: agent?.mobile || '+919876543210'
    };

    // Map variables to body components for each template
    const componentMap = {
      driving_license_reminder: {
        body_1: { type: "text", value: baseVariables.customer_name },
        body_2: { type: "text", value: baseVariables.vehicle_type },
        body_3: { type: "text", value: baseVariables.license_number },
        body_4: { type: "text", value: baseVariables.expiry_date },
        body_5: { type: "text", value: baseVariables.days_left },
        body_6: { type: "text", value: baseVariables.agent_name },
        body_7: { type: "text", value: baseVariables.agent_mobile }
      },
      fitness_certificate_reminder: {
        body_1: { type: "text", value: baseVariables.customer_name },
        body_2: { type: "text", value: baseVariables.vehicle_number },
        body_3: { type: "text", value: baseVariables.expiry_date },
        body_4: { type: "text", value: baseVariables.days_left },
        body_5: { type: "text", value: baseVariables.agent_name },
        body_6: { type: "text", value: baseVariables.agent_mobile }
      },
      noc_hypothecation_reminder: {
        body_1: { type: "text", value: baseVariables.customer_name },
        body_2: { type: "text", value: baseVariables.vehicle_number },
        body_3: { type: "text", value: baseVariables.expiry_date },
        body_4: { type: "text", value: baseVariables.days_left },
        body_5: { type: "text", value: baseVariables.agent_name },
        body_6: { type: "text", value: baseVariables.agent_mobile }
      },
      puc_certificate_reminder: {
        body_1: { type: "text", value: baseVariables.customer_name },
        body_2: { type: "text", value: baseVariables.vehicle_number },
        body_3: { type: "text", value: baseVariables.expiry_date },
        body_4: { type: "text", value: baseVariables.days_left },
        body_5: { type: "text", value: baseVariables.agent_name },
        body_6: { type: "text", value: baseVariables.agent_mobile }
      },
      road_tax_reminder: {
        body_1: { type: "text", value: baseVariables.customer_name },
        body_2: { type: "text", value: baseVariables.vehicle_number },
        body_3: { type: "text", value: baseVariables.expiry_date },
        body_4: { type: "text", value: baseVariables.days_left },
        body_5: { type: "text", value: baseVariables.agent_name },
        body_6: { type: "text", value: baseVariables.agent_mobile }
      },
      vehicle_insurance_reminder: {
        body_1: { type: "text", value: baseVariables.customer_name },
        body_2: { type: "text", value: baseVariables.vehicle_number },
        body_3: { type: "text", value: baseVariables.expiry_date },
        body_4: { type: "text", value: baseVariables.days_left },
        body_5: { type: "text", value: baseVariables.agent_name },
        body_6: { type: "text", value: baseVariables.agent_mobile }
      }
    };

    return componentMap[template_name] || {};
  }

  async sendTestMessage(mobile, template_name, test_variables = {}) {
    const defaultTestVars = {
      customer_name: "Test Customer",
      vehicle_number: "TS09AB1234",
      vehicle_type: "Car",
      license_number: "DL1234567890123",
      expiry_date: "2024-12-31",
      days_left: "45",
      agent_name: "Shuraim Tech",
      agent_mobile: "+919876543210"
    };

    const variables = { ...defaultTestVars, ...test_variables };
    
    console.log(`📱 Sending test message to: ${mobile}`);
    console.log(`📋 Template: ${template_name}`);
    console.log(`🔤 Variables:`, variables);

    return this.sendTemplateMessage({
      mobile,
      template_name,
      variables,
      agent: {
        name: variables.agent_name,
        mobile: variables.agent_mobile
      }
    });
  }

  // Simulation mode for testing without MSG91 credentials
  simulateMessage({ mobile, template_name, variables, agent }) {
    console.log('🔧 SIMULATION MODE - Message would be sent via MSG91');
    console.log('📱 To:', mobile);
    console.log('📋 Template:', template_name);
    console.log('🔤 Variables:', variables);
    
    // Create simulated components for logging
    const components = this.buildComponents(variables, template_name, agent);
    console.log('📝 Components:', components);
    
    return {
      success: true,
      provider_message_id: 'simulated_' + Date.now(),
      provider_response: {
        type: 'simulation',
        message: 'Message simulated - MSG91 credentials not configured',
        mobile: mobile,
        template: template_name,
        variables: variables,
        components: components,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Method to verify MSG91 configuration
  async verifyConfiguration() {
    const config = await this.getLatestConfig();

    if (!config.authKey || config.authKey === 'your_msg91_auth_key_here') {
      return {
        valid: false,
        message: 'MSG91_AUTH_KEY not configured in .env file - Using simulation mode',
        mode: 'simulation'
      };
    }

    try {
      // Test API connection by checking balance
      const response = await axios.get(`https://api.msg91.com/api/v5/balance`, {
        headers: {
          'authkey': config.authKey
        }
      });

      return {
        valid: true,
        message: 'MSG91 configuration is valid',
        balance: response.data,
        mode: 'production'
      };
    } catch (error) {
      return {
        valid: false,
        message: 'Failed to connect to MSG91 API',
        error: error.response?.data || error.message,
        mode: 'error'
      };
    }
  }

  // Method to get template details
  async getTemplates() {
    const config = await this.getLatestConfig();

    try {
      const response = await axios.get(`https://api.msg91.com/api/v5/templates`, {
        headers: {
          'authkey': config.authKey
        },
        params: {
          integrated_number: config.integratedNumber
        }
      });

      return {
        success: true,
        templates: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new MSG91Service();