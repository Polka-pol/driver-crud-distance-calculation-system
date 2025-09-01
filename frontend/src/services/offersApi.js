const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://connex.team/api';

class OffersApi {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Get JWT token from storage
  getAuthToken() {
    return localStorage.getItem('connex_jwt') || sessionStorage.getItem('connex_jwt');
  }

  // Make authenticated API request
  async makeRequest(endpoint, options = {}) {
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Get all offers
  async getOffers() {
    return this.makeRequest('/offers');
  }

  // Get offer by ID
  async getOffer(id) {
    return this.makeRequest(`/offers/${id}`);
  }

  // Create new offer
  async createOffer(offerData) {
    return this.makeRequest('/offers', {
      method: 'POST',
      body: JSON.stringify(offerData),
    });
  }

  // Update offer
  async updateOffer(id, updateData) {
    return this.makeRequest(`/offers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  // Delete offer
  async deleteOffer(id) {
    return this.makeRequest(`/offers/${id}`, {
      method: 'DELETE',
    });
  }

  // Send offer to drivers
  async sendOfferToDrivers(offerId, driverIds) {
    return this.makeRequest(`/offers/${offerId}/send-to-drivers`, {
      method: 'POST',
      body: JSON.stringify({ driver_ids: driverIds }),
    });
  }

  // Get offer proposals
  async getOfferProposals(offerId) {
    return this.makeRequest(`/offers/${offerId}/proposals`);
  }

  // Respond to proposal
  async respondToProposal(proposalId, response) {
    return this.makeRequest(`/proposals/${proposalId}/respond`, {
      method: 'PUT',
      body: JSON.stringify(response),
    });
  }

  // Get chat messages for offer and driver
  async getChatMessages(offerId, driverId) {
    return this.makeRequest(`/offers/${offerId}/chat/${driverId}`);
  }

  // Send chat message
  async sendChatMessage(offerId, driverId, message) {
    return this.makeRequest(`/offers/${offerId}/chat/${driverId}`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // Mark message as read
  async markMessageAsRead(messageId) {
    return this.makeRequest(`/chat/${messageId}/read`, {
      method: 'PUT',
    });
  }

  // Get socket authentication data
  async getSocketAuth() {
    return this.makeRequest('/socket/auth', {
      method: 'POST',
    });
  }

  // Get drivers by IDs
  async getDriversByIds(driverIds) {
    return this.makeRequest('/drivers/by-ids', {
      method: 'POST',
      body: JSON.stringify({ driver_ids: driverIds }),
    });
  }

  // Get offer statistics
  async getOfferStats(offerId) {
    // This might be a custom endpoint - implement based on your backend
    return {
      sent: 0,
      viewed: 0,
      responded: 0,
      accepted: 0,
      rejected: 0,
    };
  }
}

const offersApiInstance = new OffersApi();
export default offersApiInstance;



