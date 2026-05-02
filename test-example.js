// Test example - demonstrates the knapsack algorithm and API integration
const { solveKnapsack } = require('./utils/knapsack');

// Example 1: Basic knapsack test
console.log('=== Example 1: Basic Knapsack Test ===\n');

const vehicles = [
  { id: 'v1', estimatedServiceDuration: 2.5, operationalImpactScore: 85 },
  { id: 'v2', estimatedServiceDuration: 1.5, operationalImpactScore: 60 },
  { id: 'v3', estimatedServiceDuration: 3.0, operationalImpactScore: 90 },
  { id: 'v4', estimatedServiceDuration: 2.0, operationalImpactScore: 75 },
  { id: 'v5', estimatedServiceDuration: 1.0, operationalImpactScore: 50 },
];

const maxHours = 8;
const result = solveKnapsack(vehicles, maxHours);

console.log(`Budget: ${maxHours} hours`);
console.log(`Vehicles available: ${vehicles.length}`);
console.log(`\nOptimal Schedule:`);
console.log(`Selected Vehicles: ${result.selectedVehicles.join(', ')}`);
console.log(`Total Hours Used: ${result.totalHours}h`);
console.log(`Total Impact Score: ${result.totalScore}`);
console.log(`Hours Remaining: ${maxHours - result.totalHours}h`);

// Show details of selected vehicles
console.log(`\nSelected Vehicle Details:`);
result.selectedVehicles.forEach((vehicleId) => {
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  console.log(`  ${vehicleId}: ${vehicle.estimatedServiceDuration}h, Score: ${vehicle.operationalImpactScore}`);
});

// Example 2: Different budget
console.log('\n\n=== Example 2: Different Budget (5 hours) ===\n');

const result2 = solveKnapsack(vehicles, 5);
console.log(`Budget: 5 hours`);
console.log(`Selected Vehicles: ${result2.selectedVehicles.join(', ')}`);
console.log(`Total Hours Used: ${result2.totalHours}h`);
console.log(`Total Impact Score: ${result2.totalScore}`);

// Example 3: Large dataset performance test
console.log('\n\n=== Example 3: Performance Test (100 vehicles) ===\n');

const largeVehicleSet = Array.from({ length: 100 }, (_, i) => ({
  id: `v${i + 1}`,
  estimatedServiceDuration: Math.random() * 4 + 0.5, // 0.5 to 4.5 hours
  operationalImpactScore: Math.floor(Math.random() * 100) + 10, // 10 to 110
}));

const startTime = Date.now();
const result3 = solveKnapsack(largeVehicleSet, 20);
const duration = Date.now() - startTime;

console.log(`Vehicles: 100`);
console.log(`Budget: 20 hours`);
console.log(`Selected: ${result3.selectedVehicles.length} vehicles`);
console.log(`Total Score: ${result3.totalScore}`);
console.log(`Total Hours: ${result3.totalHours.toFixed(2)}h`);
console.log(`Computation Time: ${duration}ms`);

// Example 4: Edge cases
console.log('\n\n=== Example 4: Edge Cases ===\n');

// Empty vehicles
const emptyResult = solveKnapsack([], 8);
console.log(`Empty vehicles: ${JSON.stringify(emptyResult)}`);

// Zero budget
const zeroBudgetResult = solveKnapsack(vehicles, 0);
console.log(`Zero budget: ${JSON.stringify(zeroBudgetResult)}`);

// Very small budget
const smallBudgetResult = solveKnapsack(vehicles, 1);
console.log(`1 hour budget: Selected ${smallBudgetResult.selectedVehicles.length} vehicles, Score: ${smallBudgetResult.totalScore}`);

console.log('\n✅ All tests completed successfully!');
