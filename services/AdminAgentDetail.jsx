import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminAPI } from '../services/api';
import toast from 'react-hot-toast';
import { User, Users, Calendar, MessageSquare, DollarSign } from 'lucide-react';

const AdminAgentDetail = () => {
  const { id } = useParams();
  const [agentData, setAgentData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgentDetails = async () => {
      try {
        setLoading(true);
        const response = await adminAPI.getAgentDetails(id);
        setAgentData(response.data.data);
      } catch (error) {
        toast.error('Failed to load agent details.');
        console.error('Fetch agent details error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgentDetails();
  }, [id]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!agentData) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-semibold">Agent not found.</h2>
        <Link to="/admin/agents" className="text-blue-600 hover:underline">
          Back to Agents List
        </Link>
      </div>
    );
  }

  const { agent, customers, reminders, messages, transactions } = agentData;

  const InfoCard = ({ title, value, icon: Icon }) => (
    <div className="bg-white p-4 rounded-lg shadow flex items-center">
      <Icon className="h-8 w-8 text-blue-500 mr-4" />
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center">
          <div className="h-16 w-16 rounded-full bg-gray-300 flex items-center justify-center text-2xl font-bold mr-4">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{agent.name}</h1>
            <p className="text-gray-600">{agent.email} - {agent.mobile}</p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <InfoCard title="Wallet Balance" value={formatCurrency(agent.wallet_balance)} icon={DollarSign} />
        <InfoCard title="Customers" value={customers.length} icon={Users} />
        <InfoCard title="Reminders" value={reminders.length} icon={Calendar} />
        <InfoCard title="Messages Sent" value={messages.length} icon={MessageSquare} />
        <InfoCard title="Transactions" value={transactions.length} icon={DollarSign} />
      </div>

      {/* Data Tables */}
      <div className="space-y-8">
        {/* Customers Table */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Customers ({customers.length})</h2>
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Name</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Vehicle No.</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Contact</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {customers.slice(0, 5).map((customer) => (
                  <tr key={customer._id}>
                    <td className="px-3 py-4 text-sm text-gray-900">{customer.name}</td>
                    <td className="px-3 py-4 text-sm text-gray-500">{customer.vehicle_number}</td>
                    <td className="px-3 py-4 text-sm text-gray-500">{customer.mobile}</td>
                    <td className="px-3 py-4 text-sm">
                      <button className="text-blue-600 hover:text-blue-900">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers.length === 0 && <p className="text-center py-4 text-gray-500">No customers found.</p>}
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Transactions</h2>
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Type</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {transactions.slice(0, 5).map((tx) => (
                  <tr key={tx._id}>
                    <td className="px-3 py-4 text-sm text-gray-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-4 text-sm text-gray-500">{tx.type}</td>
                    <td className={`px-3 py-4 text-sm font-medium ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(tx.amount)}</td>
                    <td className="px-3 py-4 text-sm text-gray-500">{tx.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
             {transactions.length === 0 && <p className="text-center py-4 text-gray-500">No transactions found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAgentDetail;