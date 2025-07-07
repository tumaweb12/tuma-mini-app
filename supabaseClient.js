/**
 * Supabase Client Module
 * Handles all database operations with Supabase
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { API_CONFIG } from './config.js';

// Initialize Supabase client
const supabase = createClient(API_CONFIG.supabase.url, API_CONFIG.supabase.anonKey);

// Export the client for direct use if needed
export { supabase };

/**
 * Parcels/Bookings Operations
 */
export const parcelsDB = {
  // Create a new parcel booking
  async create(parcelData) {
    const { data, error } = await supabase
      .from('parcels')
      .insert([{
        ...parcelData,
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Create multiple parcels (bulk booking)
  async createBulk(parcelsArray) {
    const { data, error } = await supabase
      .from('parcels')
      .insert(parcelsArray.map(parcel => ({
        ...parcel,
        status: 'pending',
        created_at: new Date().toISOString()
      })))
      .select();
    
    if (error) throw error;
    return data;
  },

  // Get parcel by code
  async getByCode(parcelCode) {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('parcel_code', parcelCode)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update parcel status
  async updateStatus(parcelCode, status, additionalData = {}) {
    const { data, error } = await supabase
      .from('parcels')
      .update({
        status,
        ...additionalData,
        updated_at: new Date().toISOString()
      })
      .eq('parcel_code', parcelCode)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get parcels by vendor phone
  async getByVendorPhone(phone, limit = 50) {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('vendor_phone', phone)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  // Get parcels for rider
  async getForRider(riderId, status = null) {
    let query = supabase
      .from('parcels')
      .select('*')
      .eq('rider_id', riderId);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // Get available parcels for clustering
  async getAvailableForClustering(area, service) {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('status', 'pending')
      .eq('service_type', service)
      .eq('pickup_area', area)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data;
  }
};

/**
 * Managed Vendors Operations
 */
export const vendorsDB = {
  // Check if vendor is managed
  async checkManaged(phone) {
    const { data, error } = await supabase
      .from('managed_vendors')
      .select('*, agent:agents(name, code)')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return { isManaged: false };
      }
      throw error;
    }
    
    return {
      isManaged: true,
      vendorData: data,
      agentName: data.agent?.name,
      agentCode: data.agent?.code
    };
  },

  // Create managed vendor
  async create(vendorData) {
    const { data, error } = await supabase
      .from('managed_vendors')
      .insert([{
        ...vendorData,
        is_active: true,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get vendors by agent
  async getByAgent(agentId) {
    const { data, error } = await supabase
      .from('managed_vendors')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // Update vendor
  async update(vendorId, updates) {
    const { data, error } = await supabase
      .from('managed_vendors')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

/**
 * Agents Operations
 */
export const agentsDB = {
  // Get agent by code
  async getByCode(agentCode) {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('code', agentCode)
      .eq('is_active', true)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get agent by phone
  async getByPhone(phone) {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get agent stats
  async getStats(agentId, dateRange = 'all') {
    let query = supabase
      .from('parcels')
      .select('price, created_at')
      .eq('agent_id', agentId);
    
    // Add date filters based on range
    const now = new Date();
    if (dateRange === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query = query.gte('created_at', today.toISOString());
    } else if (dateRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (dateRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', monthAgo.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Calculate commission (20% of total)
    const totalRevenue = data.reduce((sum, parcel) => sum + (parcel.price || 0), 0);
    const commission = totalRevenue * 0.20;
    
    return {
      totalParcels: data.length,
      totalRevenue,
      commission,
      parcels: data
    };
  }
};

/**
 * Riders Operations
 */
export const ridersDB = {
  // Get rider by phone
  async getByPhone(phone) {
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update rider status
  async updateStatus(riderId, status) {
    const { data, error } = await supabase
      .from('riders')
      .update({
        status,
        last_seen: new Date().toISOString()
      })
      .eq('id', riderId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update rider location
  async updateLocation(riderId, lat, lng) {
    const { data, error } = await supabase
      .from('riders')
      .update({
        current_lat: lat,
        current_lng: lng,
        last_location_update: new Date().toISOString()
      })
      .eq('id', riderId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get rider earnings
  async getEarnings(riderId, dateRange = 'all') {
    let query = supabase
      .from('parcels')
      .select('price, created_at')
      .eq('rider_id', riderId)
      .eq('status', 'delivered');
    
    // Add date filters
    const now = new Date();
    if (dateRange === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query = query.gte('created_at', today.toISOString());
    } else if (dateRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', weekAgo.toISOString());
    } else if (dateRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', monthAgo.toISOString());
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Calculate earnings (70% of delivery fee)
    const totalEarnings = data.reduce((sum, parcel) => sum + (parcel.price * 0.70), 0);
    
    return {
      totalDeliveries: data.length,
      totalEarnings,
      deliveries: data
    };
  }
};

/**
 * Routes Operations
 */
export const routesDB = {
  // Create clustered route
  async create(routeData) {
    const { data, error } = await supabase
      .from('routes')
      .insert([{
        ...routeData,
        status: 'available',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get available routes
  async getAvailable(area = null) {
    let query = supabase
      .from('routes')
      .select('*')
      .eq('status', 'available');
    
    if (area) {
      query = query.eq('area', area);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  // Claim route
  async claim(routeId, riderId) {
    const { data, error } = await supabase
      .from('routes')
      .update({
        rider_id: riderId,
        status: 'claimed',
        claimed_at: new Date().toISOString()
      })
      .eq('id', routeId)
      .eq('status', 'available')
      .select()
      .single();
    
    if (error) throw error;
    
    // Update all parcels in the route
    const parcelIds = data.parcel_ids || [];
    if (parcelIds.length > 0) {
      await supabase
        .from('parcels')
        .update({
          rider_id: riderId,
          status: 'assigned',
          assigned_at: new Date().toISOString()
        })
        .in('id', parcelIds);
    }
    
    return data;
  },

  // Complete route
  async complete(routeId) {
    const { data, error } = await supabase
      .from('routes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', routeId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

/**
 * Authentication helpers
 */
export const auth = {
  // Sign in with phone (OTP)
  async signInWithPhone(phone) {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone
    });
    
    if (error) throw error;
    return data;
  },

  // Verify OTP
  async verifyOtp(phone, token) {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phone,
      token: token,
      type: 'sms'
    });
    
    if (error) throw error;
    return data;
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};

/**
 * Real-time subscriptions
 */
export const realtime = {
  // Subscribe to parcel updates
  subscribeToParcel(parcelCode, callback) {
    return supabase
      .channel(`parcel:${parcelCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'parcels',
        filter: `parcel_code=eq.${parcelCode}`
      }, callback)
      .subscribe();
  },

  // Subscribe to rider location updates
  subscribeToRiderLocation(riderId, callback) {
    return supabase
      .channel(`rider:${riderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'riders',
        filter: `id=eq.${riderId}`
      }, callback)
      .subscribe();
  },

  // Unsubscribe from channel
  unsubscribe(subscription) {
    supabase.removeChannel(subscription);
  }
};
