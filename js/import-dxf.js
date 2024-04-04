// Executed once files are selected
function importDxfFiles() {
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
}

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
