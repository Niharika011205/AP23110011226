const axios = require('axios');

const API_BASE_URL = 'http://20.207.122.201/evaluation-service';
const API_TIMEOUT = 5000; // 5 seconds timeout
const BEARER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJuaWhhcmlrYV9yQHNybWFwLmVkdS5pbiIsImV4cCI6MTc3NzcwMjI5MywiaWF0IjoxNzc3NzAxMzkzLCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiMDQ1MTU5ZjAtY2JlYS00YjhmLWE3ZmYtNTA5MGExM2Y3Mzc5IiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiciBuaWhhcmlrYSIsInN1YiI6IjhmOTk1MjNlLWRkMzMtNGJkNy05ZjhjLTIwZWRiMWE4ODg5YiJ9LCJlbWFpbCI6Im5paGFyaWthX3JAc3JtYXAuZWR1LmluIiwibmFtZSI6InIgbmloYXJpa2EiLCJyb2xsTm8iOiJhcDIzMTEwMDExMjI2IiwiYWNjZXNzQ29kZSI6IlFrYnB4SCIsImNsaWVudElEIjoiOGY5OTUyM2UtZGQzMy00YmQ3LTlmOGMtMjBlZGIxYTg4ODliIiwiY2xpZW50U2VjcmV0IjoicWZzUGROcVFDdWZ2Y0RlUCJ9.v2mSv6WO7C37ZZsTJoeOBjqt1_17MMa7wMQHBJLapCE';

// Fallback mock data - empty arrays
const FALLBACK_DEPOTS = [];
const FALLBACK_VEHICLES = [];

// Fetch depots from external API with timeout and fallback
const fetchDepots = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/depots`, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
      },
      timeout: API_TIMEOUT,
    });
    console.log('[API] Successfully fetched depots');
    return response.data;
  } catch (error) {
    console.warn('[API] Failed to fetch depots, using fallback data:', error.message);
    return FALLBACK_DEPOTS;
  }
};

// Fetch vehicles from external API with timeout and fallback
const fetchVehicles = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/vehicles`, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
      },
      timeout: API_TIMEOUT,
    });
    console.log('[API] Successfully fetched vehicles');
    return response.data;
  } catch (error) {
    console.warn('[API] Failed to fetch vehicles, using fallback data:', error.message);
    return FALLBACK_VEHICLES;
  }
};

// Fetch both depots and vehicles
const fetchAllData = async () => {
  try {
    const [depots, vehicles] = await Promise.all([fetchDepots(), fetchVehicles()]);
    return { depots, vehicles };
  } catch (error) {
    console.error('[API] Error fetching data:', error.message);
    return {
      depots: FALLBACK_DEPOTS,
      vehicles: FALLBACK_VEHICLES,
    };
  }
};

module.exports = {
  fetchDepots,
  fetchVehicles,
  fetchAllData,
};
