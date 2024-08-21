// final data - important for the export
let fileName = "test";
let lowerLeftCorner = {};
let upperRightCorner = {};
let usedLayerEntryTypes = new Map();
let points = new Map();
let polyLineCount = 0;
let ggbSegments = new Map();
let texts = new Map();
let pointsGK4 = new Map();

// add listener for file input
const fileInputElement = document.getElementById("inputfile");
fileInputElement.addEventListener("change", () => {
  importFiles();
});

// add listener for export button
const exportButtonElement = document.getElementById("export");
exportButtonElement.addEventListener("click", () => {
  exportGgbFile();
});
