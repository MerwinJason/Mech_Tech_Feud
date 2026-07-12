const XLSX = require('xlsx');

// This script generates the template.xlsx for MechTechFeud
// Ensure you have xlsx installed: npm install xlsx

const data = [
  // Headers (must match exactly)
  ["Question", "Ans 1", "Pts 1", "Ans 2", "Pts 2", "Ans 3", "Pts 3", "Ans 4", "Pts 4", "Ans 5", "Pts 5", "Ans 6", "Pts 6", "Ans 7", "Pts 7", "Ans 8", "Pts 8"],
  
  // Example 1: 5 answers
  ["Name something you might find in a software engineer's desk.", "Coffee mug", 45, "Mechanical keyboard", 30, "Headphones", 15, "Rubber duck", 8, "Snacks", 2, "", "", "", "", "", ""],
  
  // Example 2: 6 answers
  ["Name a popular programming language.", "JavaScript", 35, "Python", 25, "Java", 18, "C++", 10, "C#", 7, "Rust", 5, "", "", "", ""],
  
  // Example 3: 3 answers
  ["Which cloud provider is the most widely used?", "AWS", 50, "Azure", 30, "Google Cloud", 20, "", "", "", "", "", "", "", "", "", ""]
];

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);

// Adjust column widths for readability
ws['!cols'] = [
  {wch: 50}, // Question
  {wch: 20}, {wch: 5}, // Ans 1, Pts 1
  {wch: 20}, {wch: 5},
  {wch: 20}, {wch: 5},
  {wch: 20}, {wch: 5},
  {wch: 20}, {wch: 5},
  {wch: 20}, {wch: 5},
  {wch: 20}, {wch: 5},
  {wch: 20}, {wch: 5}
];

XLSX.utils.book_append_sheet(wb, ws, "Questions");

// Write file
XLSX.writeFile(wb, "template.xlsx");
console.log("✅ template.xlsx generated successfully!");
