// final data - important for the export
let fileName = "test";
let lowerLeftCorner = {};
let upperRightCorner = {};
let usedLayerEntryTypes = new Map();
let points = new Map();
let polyLineCount = 0;
let ggbSegments = new Map();
let texts = new Map();

// add listener for file input
const fileInputElement = document.getElementById("inputfile");
fileInputElement.addEventListener("change", () => {
  // reset variables if file is changed
  document.getElementById("output").textContent = "";
  fileName = "";
  lowerLeftCorner = {};
  upperRightCorner = {};
  usedLayerEntryTypes = new Map();
  points = new Map();
  polyLineCount = 0;
  ggbSegments = new Map();
  texts = new Map();
  // load files
  const fileReaders = [];
  Array.from(fileInputElement.files).forEach((file) => {
    fileReaders.push(
      new Promise((resolve, reject) => {
        const inputReader = new FileReader();
        inputReader.onload = () => {
          resolve({
            fileName: file.name,
            fileContent: inputReader.result,
          });
        };
        inputReader.onerror = () => {
          reject(inputReader);
        };
        inputReader.readAsText(file);
      })
    );
  });
  // process files and
  // display layers and translation suggestion
  Promise.all(fileReaders).then((results) => {
    results.forEach((result) => {
      processFile(result.fileName, result.fileContent);
    });
    displayLayersAndTranslationSuggestion();
  });
});

// process file
function processFile(dxfFileName, dxfContent) {
  // parse dxf file
  const parser = new DxfParser();
  try {
    const dxf = parser.parseSync(dxfContent);
    extractXmlFromDxf(dxf);
    fileName += dxfFileName.replace(".dxf", "");
  } catch (err) {
    document.getElementById(
      "output"
    ).textContent += `\nERROR: Something might be wrong with the provided dxf file!\n\n${err.name}, ${err.message}: \n${err.stack}`;
  }
}

function extractXmlFromDxf(dxf) {
  // COMMENT mark exists?  1xxx = yes, 9xxx = no
  const pointTypesMap = new Map(
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
  const { header } = dxf;
  if (!lowerLeftCorner.x || header.$EXTMIN.x < lowerLeftCorner.x) {
    lowerLeftCorner.x = header.$EXTMIN.x;
  }
  if (!lowerLeftCorner.y || header.$EXTMIN.y < lowerLeftCorner.y) {
    lowerLeftCorner.y = header.$EXTMIN.y;
  }
  if (!upperRightCorner.x || header.$EXTMAX.x > upperRightCorner.x) {
    upperRightCorner.x = header.$EXTMAX.x;
  }
  if (!upperRightCorner.y || header.$EXTMAX.y > upperRightCorner.y) {
    upperRightCorner.y = header.$EXTMAX.y;
  }

  const { layers } = dxf.tables.layer;

  // temporary variables for conversion
  const dxfVectorToGgbPointMap = new Map();
  const dxfPolyLines = new Map();

  // find additional info in dxf.blocks
  const additionalInfos = new Map();
  const { blocks } = dxf;

  for (const key in blocks) {
    if (Object.hasOwn(blocks, key)) {
      const block = blocks[key];
      const info = { layer: block.layer, comment: block.name2 };
      additionalInfos.set(block.name, info);
    }
  }
  // find main info about e.g. coordinates in dxf.entities
  const { entities } = dxf;
  entities.forEach((entity) => {
    const layerEntryType = `${entity.type} ${entity.layer}${
      entity.name ? ` ${entity.name}` : ""
    }`;
    const subtypeName =
      pointTypesMap.get(entity?.name?.replace("ABM_", "")) ?? entity.name;
    if (!usedLayerEntryTypes.has(layerEntryType)) {
      const entryType = {
        type: entity.type,
        subtypeId: entity.name,
        subtypeName,
        layer: entity.layer,
        color: `#${layers[entity.layer].color
          .toString(16)
          .toLowerCase()
          .padStart(6, 0)}`,
      };
      usedLayerEntryTypes.set(layerEntryType, entryType);
    }

    let key;
    switch (entity.type) {
      // TODO delete unnecessary attributes?
      case "INSERT":
        key = `P${points.size}`;
        const point = {
          entryType: layerEntryType,
          layer: entity.layer,
          x: entity.position.x,
          y: entity.position.y,
          subtypeId: entity.name,
          subtypeName,
        };
        points.set(key, point);
        const info = additionalInfos.get(entity.name);
        if (info.layer === entity.layer) {
          points.get(key).comment = info.comment;
        }
        const vectorKey = `${entity.position.x},${entity.position.y}`;
        dxfVectorToGgbPointMap.set(vectorKey, key);
        break;
      case "LINE":
      case "LWPOLYLINE":
        key = `L${polyLineCount}`;
        const line = {
          entryType: layerEntryType,
          layer: entity.layer,
          vertices: entity.vertices,
        };
        dxfPolyLines.set(key, line);
        polyLineCount++;
        break;
      case "TEXT":
        key = `T${texts.size}`;
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
  });
  // find and add node handles for lines and polylines
  dxfPolyLines.forEach((line, key, map) => {
    // set first start point
    let startPoint = line.vertices[0];
    let startVectorKey = `${startPoint.x},${startPoint.y}`;
    // add segments from (poly)line
    for (let i = 1; i < line.vertices.length; i++) {
      // find end point
      const endPoint = line.vertices[i];
      const endVectorKey = `${endPoint.x},${endPoint.y}`;
      // segment handle
      const ggbSegmentKey = `${key}L${i.toString(10)}`;
      // create points if they don't exist
      if (!dxfVectorToGgbPointMap.has(startVectorKey)) {
        createPoint(dxfVectorToGgbPointMap, startPoint, `${ggbSegmentKey}S`);
      }
      if (!dxfVectorToGgbPointMap.has(endVectorKey)) {
        createPoint(dxfVectorToGgbPointMap, endPoint, `${ggbSegmentKey}G`);
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
  });
}

function displayLayersAndTranslationSuggestion() {
  // show used layers and
  // add an option to select wanted ones
  // 1. add an html element for each and provide an option to remove each one
  // 2. provide an option to asign point/line/text types
  //    TODO provide duplicate policies
  //    (e.g. nichtfestgestellteGrenze line stays; flurstueck line is removed)
  //    What about line-point dependencies?
  // 3. collect the remaining ones afterwards

  // sort usedLayerEntryTypes by key
  usedLayerEntryTypes = new Map([...usedLayerEntryTypes.entries()].sort());

  // show usedLayerEntryTypes
  const layerTable = document.getElementById("layerList");
  layerTable.textContent = "";
  usedLayerEntryTypes.forEach((entryType, key, map) => {
    // create layer item
    const tableRow = layerTable.insertRow(-1);
    tableRow.id = key;
    // selected - are the items of this layer included in the export?
    const cell0 = tableRow.insertCell(0);
    const selectedSelectorId = `${key}_selected`;
    const selectCheckbox = document.createElement("input");
    selectCheckbox.className = "selected";
    selectCheckbox.type = "checkbox";
    selectCheckbox.checked = true;
    selectCheckbox.id = selectedSelectorId;
    cell0.appendChild(selectCheckbox);
    // selected - label
    const labelId = `${key}_label`;
    const label = document.createElement("label");
    label.textContent = `${entryType.type} ${entryType.layer}${
      entryType.subtypeName ? ` ${entryType.subtypeName}` : ""
    }`;
    label.htmlFor = selectedSelectorId;
    label.id = labelId;
    cell0.appendChild(label);
    // point or line style for the items of this layer
    const cell1 = tableRow.insertCell(1);
    const styleSelectorId = `${key}_style`;
    const styleSelector =
      entryType.type === "INSERT" || entryType.type === "TEXT"
        ? createPointStyleSelector(styleSelectorId)
        : createLineStyleSelector(styleSelectorId);
    cell1.appendChild(styleSelector);
    // color for the items of this layer
    const cell2 = tableRow.insertCell(2);
    const colorSelectorId = `${key}_color`;
    const colorSelector = document.createElement("input");
    colorSelector.className = "color";
    colorSelector.type = "color";
    colorSelector.value = entryType.color;
    colorSelector.id = colorSelectorId;
    cell2.appendChild(colorSelector);
    // size for the items of this layer
    const cell3 = tableRow.insertCell(3);
    const sizeSelectorId = `${key}_size`;
    const sizeSelector = document.createElement("input");
    sizeSelector.className = "size";
    sizeSelector.type = "number";
    sizeSelector.value = entryType.type === "INSERT" ? 3 : 2;
    sizeSelector.size = 4;
    sizeSelector.min = 1;
    sizeSelector.max = entryType.type === "INSERT" ? 9 : 13;
    sizeSelector.id = sizeSelectorId;
    cell3.appendChild(sizeSelector);
  });

  // fill in suggested map translation values
  const translation = {
    x: Math.floor(lowerLeftCorner.x),
    y: Math.floor(lowerLeftCorner.y),
  };
  document.getElementById("translationX").value = translation.x;
  document.getElementById("translationY").value = translation.y;
}

function createPoint(vectorToPointMap, newPoint, segmentPointHandle) {
  const type = "INSERT";
  const layer = "linienpunkt_sonstiger";
  const subtypeId = "UNBEKANNT";
  const subtypeName = "Unbekannt";

  const layerEntryType = `${type} ${layer} ${subtypeId}`;
  if (!usedLayerEntryTypes.has(layerEntryType)) {
    const entryType = {
      type,
      subtypeId,
      subtypeName,
      layer,
      color: "#dbdbdb",
    };
    usedLayerEntryTypes.set(layerEntryType, entryType);
  }

  const key = `P${segmentPointHandle}`;
  const point = {
    entryType: layerEntryType,
    layer,
    x: newPoint.x,
    y: newPoint.y,
    subtypeId,
    subtypeName,
  };
  points.set(key, point);

  const vectorKey = `${newPoint.x},${newPoint.y}`;
  vectorToPointMap.set(vectorKey, key);
}

function createPointStyleSelector(styleSelectorId) {
  const dotStyles = ["⏺", "x", "⭘", "+", "◆", "◇", "⮝", "⮟", "⮞", "⮜"];
  const styleSelector = document.createElement("select");
  styleSelector.className = "style";
  styleSelector.id = styleSelectorId;
  dotStyles.forEach((style, i, map) => {
    const option = document.createElement("option");
    option.value = i;
    option.text = style;
    styleSelector.appendChild(option);
  });
  return styleSelector;
}

function createLineStyleSelector(styleSelectorId) {
  const dotStyles = new Map(Object.entries({ 0: "-----", 15: "- - -" }));
  const styleSelector = document.createElement("select");
  styleSelector.className = "style";
  styleSelector.id = styleSelectorId;
  dotStyles.forEach((style, i, map) => {
    const option = document.createElement("option");
    option.value = i;
    option.text = style;
    styleSelector.appendChild(option);
  });
  return styleSelector;
}

function exportGgbFile() {
  // TODO remove duplicate lines

  // read layer customizations from ui
  const layerStyles = new Map();
  const layerList = document.getElementById("layerList");
  const layerListElements = layerList.children[0].children;
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
  const translation = {
    x: document.getElementById("translationX").value,
    y: document.getElementById("translationY").value,
  };

  // prepare xml data for final file
  let ggbContent = "";

  points.forEach((point, key, map) => {
    const style = layerStyles.get(point.entryType);
    if (!style.selected) {
      return;
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
  });

  texts.forEach((text, key, map) => {
    const style = layerStyles.get(text.entryType);
    if (!style.selected) {
      return;
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
  });

  ggbSegments.forEach((segment, key, map) => {
    const style = layerStyles.get(segment.entryType);
    if (!style.selected) {
      return;
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
  });

  saveToGGB(ggbContent);

  document.getElementById("output").textContent += "\nSuccess!";
}

// from https://stackoverflow.com/a/5624139/6307611
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
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
  const zip = new JSZip();
  // create an empty geogebra.xml file
  // and add the elements and commands from the ggbContent
  const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';

  const mapWidth = upperRightCorner.x - lowerLeftCorner.x;
  const mapHeight = upperRightCorner.y - lowerLeftCorner.y;

  const spaceLeft = 50;
  const spaceRight = 10;
  const spaceTop = 10;
  const spaceBottom = 40;

  const panelWidth = 570;
  const panelHeight = 440;
  const xZero = spaceLeft;
  const yZero = panelHeight - spaceBottom;

  const xScale = (panelWidth - spaceLeft - spaceRight) / mapWidth;
  const yScale = (panelHeight - spaceBottom - spaceTop) / mapHeight;
  const scale = Math.min(xScale, yScale);

  const ggbHeader =
    `<geogebra format="5.0" >\n` +
    `<euclidianView>\n` +
    `  <size  width="${panelWidth}" height="${panelHeight}"/>\n` +
    `  <coordSystem xZero="${xZero}" yZero="${yZero}" scale="${scale}" yscale="${scale}"/>\n` +
    `</euclidianView>\n` +
    `<construction title="" author="" date="">\n`;

  const ggbFooter = "</construction>\n</geogebra>\n";
  zip.file("geogebra.xml", xmlHeader + ggbHeader + ggbContent + ggbFooter);
  // save as ziped ggb file
  zip.generateAsync({ type: "blob" }).then((content) => {
    saveAs(content, `${fileName}.ggb`);
  });
}
