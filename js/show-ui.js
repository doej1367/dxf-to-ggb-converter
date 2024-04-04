// executed after all dxf files are imported at the end of importDxfFiles()
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
