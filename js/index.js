"use strict";

// final data - important for the export
let fileName = "test";
let lowerLeftCorner = {};
let usedLayerEntryTypes = new Map();
let points = new Map();
let polyLineCount = 0;
let ggbSegments = new Map();
let texts = new Map();

// add listener for file input
let fileInputElement = document.getElementById("inputfile");
fileInputElement.addEventListener("change", function () {
  // reset variables if file is changed
  document.getElementById("output").textContent = "";
  fileName = "";
  lowerLeftCorner = {};
  usedLayerEntryTypes = new Map();
  points = new Map();
  polyLineCount = 0;
  ggbSegments = new Map();
  texts = new Map();
  // load files
  let fileReaders = [];
  for (const file of this.files) {
    fileReaders.push(
      new Promise(function (resolve, reject) {
        let inputReader = new FileReader();
        inputReader.onload = function () {
          resolve({
            fileName: file.name,
            fileContent: inputReader.result,
          });
        };
        inputReader.onerror = function () {
          reject(inputReader);
        };
        inputReader.readAsText(file);
      })
    );
  }
  // process files and
  // display layers and translation suggestion
  Promise.all(fileReaders).then((results) => {
    for (const result of results) {
      processFile(result.fileName, result.fileContent);
    }
    displayLayersAndTranslationSuggestion();
  });
});

// process file
function processFile(dxfFileName, dxfContent) {
  // parse dxf file
  const parser = new DxfParser();
  try {
    let dxf = parser.parseSync(dxfContent);
    extractXmlFromDxf(dxf);
    fileName += dxfFileName.replace(".dxf", "");
  } catch (err) {
    document.getElementById("output").textContent +=
      "\nERROR: Something might be wrong with the provided dxf file!\n\n" +
      err.name +
      ", " +
      err.message +
      ": \n" +
      err.stack;
  }
}

function extractXmlFromDxf(dxf) {
  // COMMENT mark exists?  1xxx = yes, 9xxx = no
  let pointTypesMap = new Map(
    Object.entries({
      1000: "allgemeineMarke",
      1200: "Rohr",
      1120: "unbehauenerFeldstein",
      1110: "Grenzstein",
      1650: "Klebemarke",
      1500: "Pfahl",
      1655: "Schlagmarke",
      1400: "Meisselzeichen",
      1300: "Nagel",
      9500: "ohneMarke",
      9998: "NachQuellangabenNichtZuSpezifizieren",
      9600: "AbmarkungZeitweiligAusgesetzt",
    })
  );

  // remember layers for the layer colors later on
  let header = dxf.header;
  if (!lowerLeftCorner.x || header.$EXTMIN.x < lowerLeftCorner.x) {
    lowerLeftCorner.x = header.$EXTMIN.x;
  }
  if (!lowerLeftCorner.y || header.$EXTMIN.y < lowerLeftCorner.y) {
    lowerLeftCorner.y = header.$EXTMIN.y;
  }

  const layers = dxf.tables.layer.layers;

  // temporary variables for conversion
  let dxfVectorToGgbPointMap = new Map();
  let dxfPolyLines = new Map();

  // find additional info in dxf.blocks
  let additionalInfos = new Map();
  const blocks = dxf.blocks;
  for (const key in blocks) {
    const block = blocks[key];
    const info = { layer: block.layer, comment: block.name2 };
    additionalInfos.set(block.name, info);
  }
  // find main info about e.g. coordinates in dxf.entities
  let entities = dxf.entities;
  for (const entity of entities) {
    let layerEntryType =
      entity.type + " " + entity.layer + (entity.name ? " " + entity.name : "");
    let subtypeName =
      pointTypesMap.get(entity?.name?.replace("ABM_", "")) ?? entity.name;
    if (!usedLayerEntryTypes.has(layerEntryType)) {
      const entryType = {
        type: entity.type,
        subtypeId: entity.name,
        subtypeName: subtypeName,
        layer: entity.layer,
        color:
          "#" +
          layers[entity.layer].color.toString(16).toLowerCase().padStart(6, 0),
      };
      usedLayerEntryTypes.set(layerEntryType, entryType);
    }

    let key;
    switch (entity.type) {
      // TODO delete unnecessary attributes?
      case "INSERT":
        key = "P" + points.size;
        const point = {
          entryType: layerEntryType,
          layer: entity.layer,
          x: entity.position.x,
          y: entity.position.y,
          subtypeId: entity.name,
          subtypeName: subtypeName,
        };
        points.set(key, point);
        const info = additionalInfos.get(entity.name);
        if (info.layer == entity.layer) {
          points.get(key).comment = info.comment;
        }
        const vectorKey = entity.position.x + "," + entity.position.y;
        dxfVectorToGgbPointMap.set(vectorKey, key);
        break;
      case "LINE":
      case "LWPOLYLINE":
        key = "L" + polyLineCount;
        const line = {
          entryType: layerEntryType,
          layer: entity.layer,
          vertices: entity.vertices,
        };
        dxfPolyLines.set(key, line);
        polyLineCount++;
        break;
      case "TEXT":
        key = "T" + texts.size;
        const text = {
          entryType: layerEntryType,
          layer: entity.layer,
          x: entity.startPoint.x,
          y: entity.startPoint.y,
          text: entity.text,
        };
        texts.set(key, text);
        break;
      default:
        break;
    }
  }
  // find and add node handles for lines and polylines
  for (const [key, line] of dxfPolyLines) {
    // set first start point
    let startPoint = line.vertices[0];
    let startVectorKey = startPoint.x + "," + startPoint.y;
    // add segments from (poly)line
    for (let i = 1; i < line.vertices.length; i++) {
      // find end point
      const endPoint = line.vertices[i];
      const endVectorKey = endPoint.x + "," + endPoint.y;
      // segment handle
      const ggbSegmentKey = key + "L" + i.toString(10);
      // create points if they don't exist
      if (!dxfVectorToGgbPointMap.has(startVectorKey)) {
        createPoint(
          usedLayerEntryTypes,
          dxfVectorToGgbPointMap,
          startPoint,
          ggbSegmentKey + "S"
        );
      }
      if (!dxfVectorToGgbPointMap.has(endVectorKey)) {
        createPoint(
          usedLayerEntryTypes,
          dxfVectorToGgbPointMap,
          endPoint,
          ggbSegmentKey + "G"
        );
      }
      // add new segment to ggbSegments
      const segment = {
        entryType: line.entryType,
        layer: line.layer,
        startPoint: dxfVectorToGgbPointMap.get(startVectorKey),
        endPoint: dxfVectorToGgbPointMap.get(endVectorKey),
      };
      ggbSegments.set(ggbSegmentKey, segment);
      // set end point as start point for next line segment
      startPoint = endPoint;
      startVectorKey = endVectorKey;
    }
  }
}

function displayLayersAndTranslationSuggestion() {
  // show used layers and
  // add an option to select wanted ones
  // 1. add an html element for each and provide an option to remove each one
  // 2. provide an option to asign point/line/text types
  //    TODO provide duplicate policies (e.g. nichtfestgestellteGrenze line stays; flurstueck line is removed)
  //    What about line-point dependencies?
  // 3. collect the remaining ones afterwards

  // sort usedLayerEntryTypes by key
  usedLayerEntryTypes = new Map([...usedLayerEntryTypes.entries()].sort());

  // show usedLayerEntryTypes
  let layerTable = document.getElementById("layerList");
  layerTable.textContent = "";
  for (const [key, entryType] of usedLayerEntryTypes) {
    // create layer item
    let tableRow = layerTable.insertRow(-1);
    tableRow.id = key;
    // selected - are the items of this layer included in the export?
    let cell0 = tableRow.insertCell(0);
    let selectedSelectorId = key + "_selected";
    let selectCheckbox = document.createElement("input");
    selectCheckbox.className = "selected";
    selectCheckbox.type = "checkbox";
    selectCheckbox.checked = true;
    selectCheckbox.id = selectedSelectorId;
    cell0.appendChild(selectCheckbox);
    // selected - label
    let labelId = key + "_label";
    let label = document.createElement("label");
    label.textContent =
      entryType.type +
      " " +
      entryType.layer +
      (entryType.subtypeName ? " " + entryType.subtypeName : "");
    label.htmlFor = selectedSelectorId;
    label.id = labelId;
    cell0.appendChild(label);
    // point or line style for the items of this layer
    let cell1 = tableRow.insertCell(1);
    let styleSelectorId = key + "_style";
    let styleSelector =
      entryType.type == "INSERT" || entryType.type == "TEXT"
        ? createPointStyleSelector(styleSelectorId)
        : createLineStyleSelector(styleSelectorId);
    cell1.appendChild(styleSelector);
    // color for the items of this layer
    let cell2 = tableRow.insertCell(2);
    let colorSelectorId = key + "_color";
    let colorSelector = document.createElement("input");
    colorSelector.className = "color";
    colorSelector.type = "color";
    colorSelector.value = entryType.color;
    colorSelector.id = colorSelectorId;
    cell2.appendChild(colorSelector);
    // size for the items of this layer
    let cell3 = tableRow.insertCell(3);
    let sizeSelectorId = key + "_size";
    let sizeSelector = document.createElement("input");
    sizeSelector.className = "size";
    sizeSelector.type = "number";
    sizeSelector.value = entryType.type == "INSERT" ? 3 : 2;
    sizeSelector.size = 4;
    sizeSelector.min = 1;
    sizeSelector.max = entryType.type == "INSERT" ? 9 : 13;
    cell3.appendChild(sizeSelector);
  }

  // fill in suggested map translation values
  let translation = {
    x: Math.floor(lowerLeftCorner.x),
    y: Math.floor(lowerLeftCorner.y),
  };
  document.getElementById("translationX").value = translation.x;
  document.getElementById("translationY").value = translation.y;
}

function parseHandle(handle) {
  return parseInt(handle, 16).toString(10);
}

function createPoint(
  usedLayerEntryTypes,
  vectorToPointMap,
  newPoint,
  segmentPointHandle
) {
  const type = "INSERT";
  const layer = "linienpunkt_sonstiger";
  const subtypeId = "UNBEKANNT";
  const subtypeName = "Unbekannt";

  const layerEntryType = type + " " + layer + " " + subtypeId;
  if (!usedLayerEntryTypes.has(layerEntryType)) {
    const entryType = {
      type: type,
      subtypeId: subtypeId,
      subtypeName: subtypeName,
      layer: layer,
      color: "#dbdbdb",
    };
    usedLayerEntryTypes.set(layerEntryType, entryType);
  }

  const key = "P" + segmentPointHandle;
  const point = {
    entryType: layerEntryType,
    layer: layer,
    x: newPoint.x,
    y: newPoint.y,
    subtypeId: subtypeId,
    subtypeName: subtypeName,
  };
  points.set(key, point);

  const vectorKey = newPoint.x + "," + newPoint.y;
  vectorToPointMap.set(vectorKey, key);
}

function createPointStyleSelector(styleSelectorId) {
  let dotStyles = ["⏺", "x", "⭘", "+", "◆", "◇", "⮝", "⮟", "⮞", "⮜"];
  let styleSelector = document.createElement("select");
  styleSelector.className = "style";
  styleSelector.id = styleSelectorId;
  for (const i in dotStyles) {
    const style = dotStyles[i];
    let option = document.createElement("option");
    option.value = i;
    option.text = style;
    styleSelector.appendChild(option);
  }
  return styleSelector;
}

function createLineStyleSelector(styleSelectorId) {
  let dotStyles = { 0: "-----", 15: "- - -" };
  let styleSelector = document.createElement("select");
  styleSelector.className = "style";
  styleSelector.id = styleSelectorId;
  for (const i in dotStyles) {
    const style = dotStyles[i];
    let option = document.createElement("option");
    option.value = i;
    option.text = style;
    styleSelector.appendChild(option);
  }
  return styleSelector;
}

function exportGgbFile() {
  // TODO remove duplicate lines

  // read layer customizations from ui
  let layerStyles = new Map();
  let layerList = document.getElementById("layerList");
  let layerListElements = layerList.children[0].children;
  for (const element of layerListElements) {
    const layerStyle = {
      selected: element.getElementsByClassName("selected")[0].checked,
      style: element.getElementsByClassName("style")[0].value,
      color: element.getElementsByClassName("color")[0].value,
      size: element.getElementsByClassName("size")[0].value,
    };
    layerStyles.set(element.id, layerStyle);
  }

  // read map translation values from ui
  let translation = {
    x: document.getElementById("translationX").value,
    y: document.getElementById("translationY").value,
  };

  // prepare xml data for final file
  let ggbContent = "";

  for (const [key, point] of points) {
    const style = layerStyles.get(point.entryType);
    if (!style.selected) {
      continue;
    }
    const color = hexToRgb(style.color);
    ggbContent +=
      `<element type="point" label="${key}">\n` +
      `  <show object="true" label="false"/>\n` +
      `  <objColor r="${color.r}" g="${color.g}" b="${color.b}" alpha="0.0"/>\n` +
      `  <layer val="0"/>\n` +
      `  <labelMode val="0"/>\n` +
      `  <fixed val="true"/>\n` +
      `  <auxiliary val="true"/>\n` +
      `  <coords x="${point.x - translation.x}" y="${
        point.y - translation.y
      }" z="1.0"/>\n` +
      `  <pointSize val="${style.size}"/>\n` +
      `  <pointStyle val="${style.style}"/>\n` +
      `  <caption val="${point.subtypeName} (${point.layer})"/>\n` +
      "</element>\n";
  }

  for (const [key, text] of texts) {
    const style = layerStyles.get(text.entryType);
    if (!style.selected) {
      continue;
    }
    const color = hexToRgb(style.color);
    ggbContent +=
      `<element type="point" label="${key}">\n` +
      `  <show object="true" label="true"/>\n` +
      `  <objColor r="${color.r}" g="${color.g}" b="${color.b}" alpha="0.0"/>\n` +
      `  <layer val="0"/>\n` +
      `  <labelMode val="3"/>\n` +
      `  <fixed val="true"/>\n` +
      `  <auxiliary val="true"/>\n` +
      `  <coords x="${text.x - translation.x}" y="${
        text.y - translation.y
      }" z="1.0"/>\n` +
      `  <pointSize val="${style.size}"/>\n` +
      `  <pointStyle val="${style.style}"/>\n` +
      `  <caption val="${text.text}"/>\n` +
      "</element>\n";
  }

  for (const [key, segment] of ggbSegments) {
    const style = layerStyles.get(segment.entryType);
    if (!style.selected) {
      continue;
    }
    const color = hexToRgb(style.color);
    ggbContent +=
      `<command name="Segment">\n` +
      `  <input a0="${segment.startPoint}" a1="${segment.endPoint}"/>\n` +
      `  <output a0="${key}"/>\n` +
      `</command>\n` +
      `<element type="segment" label="${key}">\n` +
      `  <show object="true" label="false"/>\n` +
      `  <objColor r="${color.r}" g="${color.g}" b="${color.b}" alpha="0.0"/>\n` +
      `  <layer val="0"/>\n` +
      `  <labelMode val="0"/>\n` +
      `  <fixed val="true"/>\n` +
      `  <auxiliary val="true"/>\n` +
      `  <coords x="0.0" y="1.0" z="-1.0"/>\n` +
      `  <lineStyle thickness="1" type="${style.style}" typeHidden="1"/>\n` +
      `  <outlyingIntersections val="false"/>\n` +
      `  <keepTypeOnTransform val="true"/>\n` +
      `</element>\n`;
  }

  saveToGGB(ggbContent);

  document.getElementById("output").textContent += "\nSuccess!";
}

// from https://stackoverflow.com/a/5624139/6307611
function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// output file to the download folder
function saveToGGB(ggbContent) {
  // start zip creation
  let zip = new JSZip();
  // create an empty geogebra.xml file
  // and add the elements and commands from the ggbContent
  let xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';
  let ggbHeader =
    '<geogebra format="5.0" >\n' +
    '<construction title="" author="" date="">\n';
  let ggbFooter = "</construction>\n" + "</geogebra>\n";
  zip.file("geogebra.xml", xmlHeader + ggbHeader + ggbContent + ggbFooter);
  // save as ziped ggb file
  zip.generateAsync({ type: "blob" }).then(function (content) {
    saveAs(content, fileName + ".ggb");
  });
}
