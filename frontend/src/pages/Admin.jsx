import { useEffect, useState, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../api/client.js';

const ROLES = ['user', 'admin'];

function fmt(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(paise) {
  return '₹' + (paise / 100).toFixed(0);
}

// ============================================
// 1. REVENUE DASHBOARD COMPONENT
// ============================================
function RevenueDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/api/admin/analytics/revenue');
      setData(data);
    } catch (err) {
      console.error('Failed to fetch revenue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const byPlan = data?.by_plan || [];

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Revenue Overview</h3>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
        >
          Refresh
        </button>
      </div>
      {/* Revenue Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Revenue', value: formatCurrency(stats.total_revenue || 0), color: 'text-white' },
          { label: 'Paid Revenue', value: formatCurrency(stats.paid_revenue || 0), color: 'text-green-400' },
          { label: 'Pending', value: formatCurrency(stats.pending_revenue || 0), color: 'text-yellow-400' },
          { label: 'Today', value: formatCurrency(stats.today_revenue || 0), color: 'text-primary' },
          { label: 'This Week', value: formatCurrency(stats.week_revenue || 0), color: 'text-primary' },
          { label: 'This Month', value: formatCurrency(stats.month_revenue || 0), color: 'text-primary' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue by Plan */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h3 className="text-lg font-semibold mb-4">Revenue by Plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {byPlan.map((plan) => (
            <div key={plan.plan} className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.03]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">{plan.plan_name}</span>
                <span className="text-primary font-bold">{formatCurrency(plan.total_amount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">{plan.count} purchases</span>
                <span className="text-white/30">Plan {plan.plan}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Credit Buyers */}
      <TopCreditBuyers />

      {/* Payment Details Table */}
      <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.08] bg-white/[0.02]">
          <h3 className="text-lg font-semibold">Recent Payments</h3>
          <p className="text-white/50 text-sm">Who bought what plan</p>
        </div>
        <PaymentDetailsTable />
      </div>
    </div>
  );
}

// Top Credit Buyers Component with Filter
function TopCreditBuyers() {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userHistory, setUserHistory] = useState([]);

  const fetchBuyers = async () => {
    setLoading(true);
    try {
      console.log('Fetching top buyers for period:', period);
      const response = await apiClient.get(`/api/admin/analytics/top-buyers?period=${period}`);
      console.log('Top buyers response:', response.data);
      setBuyers(response.data?.buyers || []);
    } catch (err) {
      console.error('Failed to fetch top buyers:', err);
      console.error('Error response:', err?.response?.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuyers();
  }, [period]);

  const fetchUserHistory = async (userId) => {
    try {
      const { data } = await apiClient.get(`/api/admin/analytics/user-purchases/${userId}`);
      setUserHistory(data?.purchases || []);
    } catch (err) {
      console.error('Failed to fetch user history:', err);
    }
  };

  const handleUserClick = (user) => {
    setSelectedUser(user);
    fetchUserHistory(user.user_id);
  };

  const periodLabels = {
    all: 'All Time',
    today: 'Today',
    week: 'This Week',
    month: 'This Month'
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold">Top Credit Buyers</h3>
          <p className="text-white/50 text-sm">Users who purchased the most credits ({periodLabels[period]})</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-sm">Filter:</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-primary"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button
            onClick={fetchBuyers}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : buyers.length === 0 ? (
        <div className="text-center py-12 text-white/50">
          <p className="text-4xl mb-2">🛒</p>
          <p>No purchases found for this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {buyers.map((buyer, index) => (
            <div
              key={buyer.user_id}
              onClick={() => handleUserClick(buyer)}
              className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:border-primary/30 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                  index === 1 ? 'bg-gray-400/20 text-gray-300' :
                  index === 2 ? 'bg-orange-600/20 text-orange-400' :
                  'bg-white/10 text-white/60'
                }`}>
                  {index + 1}
                </span>
                <div>
                  <p className="text-white font-medium">{buyer.full_name || buyer.email.split('@')[0]}</p>
                  <p className="text-white/40 text-sm">{buyer.email}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-primary font-bold text-lg">{buyer.total_credits_bought} credits</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-white/50">{buyer.total_purchases} purchases</span>
                  <span className="text-green-400">₹{(buyer.total_spent_paise / 100).toFixed(0)} spent</span>
                </div>
                <p className="text-white/30 text-xs mt-1">Last purchase: {fmt(buyer.last_purchase_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User Purchase History Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedUser(null)}
        >
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {selectedUser.full_name || selectedUser.email.split('@')[0]}
                </h3>
                <p className="text-white/50 text-sm">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-2xl font-bold text-primary">{selectedUser.total_credits_bought}</p>
                <p className="text-white/40 text-xs">Total Credits</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-2xl font-bold text-white">{selectedUser.total_purchases}</p>
                <p className="text-white/40 text-xs">Purchases</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-2xl font-bold text-green-400">₹{(selectedUser.total_spent_paise / 100).toFixed(0)}</p>
                <p className="text-white/40 text-xs">Total Spent</p>
              </div>
            </div>

            <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Purchase History</h4>
            <div className="space-y-2">
              {userHistory.length === 0 ? (
                <p className="text-white/40 text-center py-4">Loading...</p>
              ) : (
                userHistory.map((purchase) => (
                  <div
                    key={purchase.payment_id}
                    className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-between"
                  >
                    <div>
                      <p className="text-white text-sm">{purchase.plan_name}</p>
                      <p className="text-white/40 text-xs">{purchase.credits} credits</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium">₹{purchase.amount_rupees}</p>
                      <p className="text-white/30 text-xs">{fmt(purchase.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </m.div>
        </div>
      )}
    </div>
  );
}

// Payment Details Table Component
function PaymentDetailsTable() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const { data } = await apiClient.get('/api/admin/analytics/payments');
        setPayments(data?.payments?.slice(0, 20) || []);
      } catch (err) {
        console.error('Failed to fetch payments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-white/50">Loading...</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.02]">
            <th className="text-left px-4 py-3 text-white/40 font-medium">User</th>
            <th className="text-left px-4 py-3 text-white/40 font-medium">Plan</th>
            <th className="text-left px-4 py-3 text-white/40 font-medium">Credits</th>
            <th className="text-left px-4 py-3 text-white/40 font-medium">Amount</th>
            <th className="text-left px-4 py-3 text-white/40 font-medium">Status</th>
            <th className="text-left px-4 py-3 text-white/40 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.payment_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <div>
                  <p className="text-white/80 text-sm">{p.user_name || 'No name'}</p>
                  <p className="text-white/40 text-xs">{p.user_email}</p>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  p.plan === 1 ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'
                }`}>
                  {p.plan_name}
                </span>
              </td>
              <td className="px-4 py-3 text-white/60">{p.credits}</td>
              <td className="px-4 py-3 text-white font-medium">₹{p.amount_rupees}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  p.status === 'paid' ? 'bg-green-500/20 text-green-400' : 
                  p.status === 'created' ? 'bg-yellow-500/20 text-yellow-400' : 
                  'bg-red-500/20 text-red-400'
                }`}>
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-3 text-white/40 text-xs">{fmt(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// 2. USER ENGAGEMENT COMPONENT
// ============================================
function UserEngagement() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topUsersFilter, setTopUsersFilter] = useState('10');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/api/admin/analytics/users');
      setData(data);
    } catch (err) {
      console.error('Failed to fetch user analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const topUsers = data?.top_users?.slice(0, parseInt(topUsersFilter)) || [];

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">User Engagement Overview</h3>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
        >
          Refresh
        </button>
      </div>

      {/* User Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Users', value: stats.total_users || 0 },
          { label: 'New Today', value: stats.today_users || 0 },
          { label: 'New This Week', value: stats.week_users || 0 },
          { label: 'New This Month', value: stats.month_users || 0 },
          { label: 'Active (7d)', value: stats.active_7d || 0 },
          { label: 'Active (30d)', value: stats.active_30d || 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Top Users by Videos */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Top Users by Videos Created</h3>
          <select
            value={topUsersFilter}
            onChange={(e) => setTopUsersFilter(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-primary"
          >
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
            <option value="50">Top 50</option>
          </select>
        </div>
        <div className="space-y-3">
          {topUsers.map((user, index) => (
            <div key={user.user_id} className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  {index + 1}
                </span>
                <div>
                  <p className="text-white/80 text-sm">{user.full_name || user.email.split('@')[0]}</p>
                  <p className="text-white/40 text-xs">{user.email}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-primary font-bold">{user.video_count} videos</p>
                <p className="text-white/40 text-xs">{user.total_credits} credits</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 3. VIDEO ANALYTICS COMPONENT
// ============================================
function VideoAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/api/admin/analytics/videos');
      setData(data);
    } catch (err) {
      console.error('Failed to fetch video analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Video Processing Overview</h3>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
        >
          Refresh
        </button>
      </div>

      {/* Video Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Videos', value: stats.total_videos || 0 },
          { label: 'Today', value: stats.today_videos || 0 },
          { label: 'This Week', value: stats.week_videos || 0 },
          { label: 'This Month', value: stats.month_videos || 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <p className="text-white/40 text-sm uppercase tracking-wider">Success Rate</p>
          <p className="text-3xl font-bold text-green-400 mt-2">{stats.success_rate || 100}%</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <p className="text-white/40 text-sm uppercase tracking-wider">Avg Processing Time</p>
          <p className="text-3xl font-bold text-primary mt-2">~2-3 min</p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 4. CREDIT ECONOMY COMPONENT
// ============================================
function CreditEconomy() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/api/admin/analytics/credits');
      setData(data);
    } catch (err) {
      console.error('Failed to fetch credit analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const zeroCreditUsers = data?.zero_credit_users || [];

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Credit Economy Overview</h3>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
        >
          Refresh
        </button>
      </div>

      {/* Credit Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total in Circulation', value: stats.total_credits_circulation || 0 },
          { label: 'Purchased Credits', value: stats.total_credits_purchased || 0 },
          { label: 'Granted Credits', value: stats.total_credits_granted || 0 },
          { label: 'Avg per User', value: Math.round(stats.avg_credits_per_user || 0) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Users with Zero Credits */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Users with Zero Credits ({zeroCreditUsers.length})</h3>
            <p className="text-white/50 text-sm">Potential churn risk - consider targeted offers</p>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-primary"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {[...zeroCreditUsers]
            .sort((a, b) => {
              if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
              return new Date(a.created_at) - new Date(b.created_at);
            })
            .slice(0, 10)
            .map((user) => (
            <div key={user.id} className="flex items-center justify-between p-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <div>
                <p className="text-white/80 text-sm">{user.full_name || user.email.split('@')[0]}</p>
                <p className="text-white/40 text-xs">{user.email}</p>
              </div>
              <span className="text-yellow-400 text-xs">Joined {fmt(user.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 5. USER MANAGER COMPONENT
// ============================================
function UserManager({ currentUser, showRoleControls }) {
  const [profiles, setProfiles] = useState([]);
  const [videoStats, setVideoStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('joined_desc');
  const [updatingId, setUpdatingId] = useState(null);
  const [grantingId, setGrantingId] = useState(null);
  const [grantAmount, setGrantAmount] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    const [profilesRes, statsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, role, credits, created_at, avatar_url')
        .order('created_at', { ascending: false }),
      supabase.rpc('get_all_user_video_stats'),
    ]);

    if (profilesRes.error) {
      setError(profilesRes.error.message);
    } else {
      setProfiles(profilesRes.data ?? []);
    }

    if (!statsRes.error && statsRes.data) {
      const map = {};
      for (const row of statsRes.data) {
        map[row.user_id] = { video_count: row.video_count, last_video_at: row.last_video_at };
      }
      setVideoStats(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const grantCredits = async (profileId) => {
    const amount = parseInt(grantAmount[profileId] || '100', 10);
    if (!amount || amount < 100) return;
    setGrantingId(profileId);
    try {
      await apiClient.post('/api/admin/grant-credits', { user_id: profileId, credits: amount });
      setProfiles((prev) =>
        prev.map((p) => p.id === profileId ? { ...p, credits: (p.credits ?? 0) + amount } : p)
      );
      setGrantAmount((prev) => ({ ...prev, [profileId]: '' }));
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to grant credits.');
    } finally {
      setGrantingId(null);
    }
  };

  const changeRole = async (profileId, newRole) => {
    setUpdatingId(profileId);
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId);
    if (err) {
      alert(`Failed to update role: ${err.message}`);
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
      );
    }
    setUpdatingId(null);
  };

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return p.email?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q);
  }).sort((a, b) => {
    const statsA = videoStats[a.id];
    const statsB = videoStats[b.id];
    
    switch (sortBy) {
      case 'credits_desc':
        return (b.credits || 0) - (a.credits || 0);
      case 'credits_asc':
        return (a.credits || 0) - (b.credits || 0);
      case 'videos_desc':
        return (statsB?.video_count || 0) - (statsA?.video_count || 0);
      case 'videos_asc':
        return (statsA?.video_count || 0) - (statsB?.video_count || 0);
      case 'lastvideo_desc':
        return new Date(statsB?.last_video_at || 0) - new Date(statsA?.last_video_at || 0);
      case 'lastvideo_asc':
        return new Date(statsA?.last_video_at || 0) - new Date(statsB?.last_video_at || 0);
      case 'joined_desc':
        return new Date(b.created_at) - new Date(a.created_at);
      case 'joined_asc':
        return new Date(a.created_at) - new Date(b.created_at);
      default:
        return 0;
    }
  });

  const totalVideos = Object.values(videoStats).reduce((sum, s) => sum + Number(s.video_count), 0);
  const activeUsers = Object.keys(videoStats).length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total users', value: profiles.length },
          { label: 'Total videos made', value: totalVideos },
          { label: 'Users with videos', value: activeUsers },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-white text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full max-w-sm bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-primary text-sm transition"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white/70 focus:outline-none focus:border-primary"
        >
          <option value="joined_desc">Sort: Joined (Newest)</option>
          <option value="joined_asc">Sort: Joined (Oldest)</option>
          <option value="credits_desc">Sort: Credits (High → Low)</option>
          <option value="credits_asc">Sort: Credits (Low → High)</option>
          <option value="videos_desc">Sort: Videos (High → Low)</option>
          <option value="videos_asc">Sort: Videos (Low → High)</option>
          <option value="lastvideo_desc">Sort: Last Video (Recent)</option>
          <option value="lastvideo_asc">Sort: Last Video (Oldest)</option>
        </select>
        <button
          onClick={loadData}
          className="px-4 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                <th className="text-left px-6 py-4 text-white/40 font-medium">User</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Email</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Credits</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Give credits</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Videos</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Last video</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Joined</th>
                <th className="text-left px-6 py-4 text-white/40 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-white/30">
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map((profile) => {
                  const stats = videoStats[profile.id];
                  return (
                    <tr
                      key={profile.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                              {(profile.full_name || profile.email || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <span className="text-white/80">
                            {profile.full_name || <span className="text-white/30 italic">No name</span>}
                          </span>
                          {profile.id === currentUser?.id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">you</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/60">{profile.email}</td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-semibold ${(profile.credits ?? 0) > 0 ? 'text-primary' : 'text-white/30'}`}>
                          {profile.credits ?? 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="100"
                            max="1000"
                            value={grantAmount[profile.id] || ''}
                            onChange={(e) => setGrantAmount((prev) => ({ ...prev, [profile.id]: e.target.value }))}
                            placeholder="100"
                            className="w-14 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => grantCredits(profile.id)}
                            disabled={grantingId === profile.id}
                            className="px-2.5 py-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {grantingId === profile.id ? '…' : '+ Add'}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {stats ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary">
                            {stats.video_count}
                          </span>
                        ) : (
                          <span className="text-white/25">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-white/50 text-xs">
                        {stats ? fmt(stats.last_video_at) : '-'}
                      </td>
                      <td className="px-6 py-4 text-white/40 text-xs">
                        {profile.created_at ? fmt(profile.created_at) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {showRoleControls ? (
                          <select
                            value={profile.role || 'user'}
                            onChange={(e) => changeRole(profile.id, e.target.value)}
                            disabled={updatingId === profile.id || profile.id === currentUser?.id}
                            className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-white/70 text-xs focus:outline-none focus:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r} className="bg-[#1a1a1a]">{r}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-white/50 text-xs">{profile.role || 'user'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// 6. FEEDBACK MANAGER COMPONENT
// ============================================
function FeedbackManager() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedFeedback, setSelectedFeedback] = useState(null);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await apiClient.get('/api/admin/feedbacks', { params });
      setFeedbacks(data || []);
    } catch (err) {
      console.error('Failed to fetch feedbacks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, [filter]);

  const updateStatus = async (id, status) => {
    try {
      await apiClient.patch(`/api/admin/feedbacks/${id}?status=${status}`);
      fetchFeedbacks();
      if (selectedFeedback?.id === id) {
        setSelectedFeedback({ ...selectedFeedback, status });
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const unreadCount = feedbacks.filter(f => f.status === 'unread').length;

  return (
    <div className="space-y-6">
      {/* Header with Filter */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold">User Feedback</h3>
          <p className="text-white/50 text-sm">
            {unreadCount > 0 ? `${unreadCount} unread messages` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-primary"
          >
            <option value="all">All Feedback</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="replied">Replied</option>
          </select>
          <button
            onClick={fetchFeedbacks}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Feedback List */}
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-16 text-white/50">
          <p className="text-4xl mb-4">💬</p>
          <p>No feedback found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((feedback) => (
            <div
              key={feedback.id}
              onClick={() => setSelectedFeedback(feedback)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                feedback.status === 'unread' 
                  ? 'border-primary/30 bg-primary/5 hover:border-primary/50' 
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium text-white truncate">
                      {feedback.name}
                    </span>
                    {feedback.status === 'unread' && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-sm line-clamp-2">{feedback.message}</p>
                  <p className="text-white/30 text-xs mt-2">{feedback.email}</p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    feedback.status === 'unread' ? 'bg-yellow-500/20 text-yellow-400' :
                    feedback.status === 'read' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {feedback.status}
                  </span>
                  <p className="text-white/30 text-xs mt-2">{formatDate(feedback.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Feedback Detail Modal */}
      <AnimatePresence>
        {selectedFeedback && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedFeedback(null)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold">{selectedFeedback.name}</h3>
                  <p className="text-white/50 text-sm">{selectedFeedback.email}</p>
                  <p className="text-white/30 text-xs mt-1">{formatDate(selectedFeedback.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    selectedFeedback.status === 'unread' ? 'bg-yellow-500/20 text-yellow-400' :
                    selectedFeedback.status === 'read' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {selectedFeedback.status}
                  </span>
                  <button
                    onClick={() => setSelectedFeedback(null)}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 mb-6">
                <p className="text-white/80 whitespace-pre-wrap">{selectedFeedback.message}</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white/50 text-sm">Update status:</span>
                  {['unread', 'read', 'replied'].map((status) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(selectedFeedback.id, status)}
                      disabled={selectedFeedback.status === status}
                      className={`px-3 py-1.5 rounded-lg text-xs capitalize transition ${
                        selectedFeedback.status === status
                          ? 'bg-white/10 text-white/30 cursor-not-allowed'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <a
                  href={`mailto:${selectedFeedback.email}?subject=Re: Your Feedback`}
                  className="px-4 py-2 bg-primary/20 text-primary hover:bg-primary/30 rounded-lg text-sm transition"
                >
                  Reply via Email
                </a>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// MAIN ADMIN PAGE COMPONENT
// ============================================
export default function Admin() {
  const { user: currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('revenue');
  const [profile, setProfile] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Check user role on mount
  useEffect(() => {
    const checkRole = async () => {
      if (!currentUser?.id) return;
      
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

      const { data: superAdminData } = await supabase.rpc('is_super_admin');

      setProfile(profileData);
      setIsSuperAdmin(superAdminData);
    };

    checkRole();
  }, [currentUser]);

  // Any admin sees the panel
  const showAdminPanel = profile?.role === 'admin';

  // Only super admin sees the role management section
  const showRoleControls = isSuperAdmin;

  const allTabs = [
    { id: 'revenue', label: 'Revenue', icon: '💰' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'videos', label: 'Videos', icon: '🎬' },
    { id: 'credits', label: 'Credits', icon: '⭐' },
    { id: 'manage', label: 'Manage', icon: '⚙️' },
    { id: 'feedbacks', label: 'Feedbacks', icon: '💬' },
  ];

  // Filter tabs based on role - only show Manage tab for admins
  const tabs = allTabs.filter(tab => tab.id !== 'manage' || showAdminPanel);

  const handleSignOut = async () => {
    await signOut();
    navigate('/signin');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-body">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold font-display">Admin Dashboard</h1>
              <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
                {currentUser?.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-sm transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <m.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'revenue' && <RevenueDashboard />}
            {activeTab === 'users' && <UserEngagement />}
            {activeTab === 'videos' && <VideoAnalytics />}
            {activeTab === 'credits' && <CreditEconomy />}
            {activeTab === 'manage' && <UserManager currentUser={currentUser} showRoleControls={showRoleControls} />}
            {activeTab === 'feedbacks' && <FeedbackManager />}
          </m.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
