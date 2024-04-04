// Executed on "Export to GGB" button
function exportGgbFile() {
  // TODO remove duplicate line segments

  // read layer customizations from ui
  const layerStyles = new Map();
  const layerList = document.getElementById("layerList");
  const layerListElements = layerList.children[0].children;
  Array.from(layerListElements).forEach((element) => {
    const layerStyle = {
      selected: element.getElementsByClassName("selected")[0].checked,
      style: element.getElementsByClassName("style")[0].value,
      color: element.getElementsByClassName("color")[0].value,
      size: element.getElementsByClassName("size")[0].value,
    };
    layerStyles.set(element.id, layerStyle);
  });

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
