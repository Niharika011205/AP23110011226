// 0/1 Knapsack implementation using Dynamic Programming
// Time Complexity: O(n * maxHours)
// Space Complexity: O(n * maxHours)
// This approach is optimal for this problem as it guarantees the best solution

const solveKnapsack = (vehicles, maxHours) => {
  const n = vehicles.length;

  // Edge case: no vehicles or no budget
  if (n === 0 || maxHours === 0) {
    return {
      selectedVehicles: [],
      totalScore: 0,
      totalHours: 0,
    };
  }

  // DP table: dp[i][w] = max score using first i vehicles with w hours budget
  const dp = Array(n + 1)
    .fill(null)
    .map(() => Array(maxHours + 1).fill(0));

  // Fill the DP table
  for (let i = 1; i <= n; i++) {
    const vehicle = vehicles[i - 1];
    const duration = Math.ceil(vehicle.estimatedServiceDuration);
    const score = vehicle.operationalImpactScore;

    for (let w = 0; w <= maxHours; w++) {
      // Option 1: Don't include this vehicle
      dp[i][w] = dp[i - 1][w];

      // Option 2: Include this vehicle (if it fits)
      if (duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - duration] + score);
      }
    }
  }

  // Backtrack to find which vehicles were selected
  const selectedVehicles = [];
  let w = maxHours;

  for (let i = n; i > 0; i--) {
    // If value comes from including this vehicle
    if (dp[i][w] !== dp[i - 1][w]) {
      const vehicle = vehicles[i - 1];
      selectedVehicles.push(vehicle.id);
      w -= Math.ceil(vehicle.estimatedServiceDuration);
    }
  }

  // Calculate totals
  const totalHours = selectedVehicles.reduce((sum, vehicleId) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    return sum + Math.ceil(vehicle.estimatedServiceDuration);
  }, 0);

  const totalScore = dp[n][maxHours];

  return {
    selectedVehicles: selectedVehicles.reverse(),
    totalScore,
    totalHours,
  };
};

module.exports = { solveKnapsack };
