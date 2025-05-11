<script>
  import { onMount } from "svelte";
  import mapboxgl from "mapbox-gl";
  import * as d3 from "d3";
  import { parse } from "svelte/compiler";

  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  let longitude = -71.1;
  let latitude = 42.38;
  let zoom = 8.5;

  let zoningMap;
  let singleFamilyGeo;
  let singleFamilyCsvData = new Map();
  let complianceCsvData = new Map();
  let activeTab = 'income'; // default tab
  let usePercentage = true; // true = show %; false = show raw counts

  // Precomputed cache
  let incomeCache = new Map();
  let demoCache = new Map();

  // Scatterplot data
  let scatterData = [];
  let selectedMuni = null;
  let svg;
  let tooltip;
  let x;
  let y;

  // Define groups of columns for each income level
  let selectedIncomeLevel = 3; // slider value (0-5)
  const incomeLevelGroups = [
    ['incu10', 'inc1015', 'inc1520', 'inc2025'],                      // <25k
    ['inc2530', 'inc3035', 'inc3540', 'inc4045', 'inc4550'],           // 25k–50k
    ['inc5060', 'inc6075', 'i7599'],                                   // 50k–100k
    ['i100125', 'i125150'],                                            // 100k–150k
    ['i150200'],                                                       // 150k–200k
    ['in200o']                                                         // >200k
  ];

  // Define demographic groups
  let selectedDemographic = 'Non-Hispanic White'; // default selection for demographics
  const demographicColumns = {
    'Non-Hispanic White': ['nhwhi', 'nhwhi_p'],
    'Non-Hispanic Black': ['nhaa', 'nhaa_p'],
    'Non-Hispanic American Indian': ['nhna', 'nhna_p'],
    'Non-Hispanic Asian': ['nhas', 'nhas_p'],
    'Non-Hispanic Pacific Islander': ['nhpi', 'nhpi_p'],
    'Non-Hispanic Other Race': ['nhoth', 'nhoth_p'],
    'Non-Hispanic Multi-Race': ['nhmlt', 'nhmlt_p'],
    'Hispanic or Latino': ['latino', 'lat_p'],
  };

  // Define family size groups
  let selectedFamilySizeOption = 'Family Households - 2 people'; // default selection for family size
  const familySizeOptions = {
    "Family Households - 2 people": "fhh2",
    "Family Households - 3 people": "fhh3",
    "Family Households - 4 people": "fhh4",
    "Family Households - 5 people": "fhh5",
    "Family Households - 6 people": "fhh6",
    "Family Households - 7+ people": "fhh7o",
    "Nonfamily Households - 1 person": "nfhh1",
    "Nonfamily Households - 2 people": "nfhh2",
    "Nonfamily Households - 3 people": "nfhh3",
    "Nonfamily Households - 4 people": "nfhh4",
    "Nonfamily Households - 5 people": "nfhh5",
    "Nonfamily Households - 6 people": "nfhh6",
    "Nonfamily Households - 7+ people": "nfhh7o"
  };

  // const groupLabels = activeTab === 'demographics'
  //   ? Object.keys(demographicColumns)
  //   : activeTab === 'income'
  //     ? incomeLevelGroups.map((g, i) => `Group ${i}`)
  //     : Object.keys(familySizeOptions);

  // const colorScale = d3.scaleOrdinal().domain(groupLabels).range(d3.schemeSet2);

  const colorScale = d3.scaleOrdinal()
  .domain(Object.keys(demographicColumns)) // or income ranges / family size
  .range(d3.schemeTableau10);

  // Housing timeline
  let timelineDataMap = new Map();
  let timelineMaxUnits = 0;
  let barSvg, barX, barY;
  let selectedYear = 2025; // default year for timeline
  let searchQuery = ''; // for filtering municipalities

  async function loadData() {
    // Load CSV and GeoJSON data
    // const singleFamilyCsv = await d3.csv(import.meta.env.BASE_URL + 'single_family_zoning/housing_sf_other_w_census.csv');
    const singleFamilyCsv = await d3.csv('single_family_zoning/housing_sf_other_w_census.csv');
    // singleFamilyGeo = await fetch(import.meta.env.BASE_URL + 'single_family_zoning/housing_sf_other_w_census_reprojected.json').then(res => res.json());
    singleFamilyGeo = await fetch('single_family_zoning/mapc_region_towns_w_population.geojson').then(res => res.json());
    // const unitPriceCsv = await d3.csv(import.meta.env.BASE_URL + 'scatterplot/average_unit_price_by_municipality.csv');
    const unitPriceCsv = await d3.csv('scatterplot/average_unit_price_by_municipality.csv');
    // const yearMuniAcc = await fetch(import.meta.env.BASE_URL + 'housing_timeline/year_municipality_accumulation_filtered.json').then(res => res.json());
    const yearMuniAcc = await fetch('housing_timeline/year_municipality_accumulation_filtered.json').then(res => res.json());
    const complianceCsv = await d3.csv('single_family_zoning/compliance_muni_census.csv');

    // Build CSV map
    singleFamilyCsvData = new Map();
    singleFamilyCsv.forEach(row => {
      singleFamilyCsvData.set(parseInt(row.muni_id), row);
    });
    complianceCsvData = new Map();
    complianceCsv.forEach(row => {
      complianceCsvData.set(parseInt(row.muni_id), row);
    });

    // Build unit price map
    const unitPriceMap = new Map();
    unitPriceCsv.forEach(d => {
      if (d.muni && d.average_unit_price) {
        unitPriceMap.set(d.muni.trim().toLowerCase(), parseFloat(d.average_unit_price));
      }
    });
    console.log("Unit Price Map: ", unitPriceMap);

    // Build precomputed cache
    singleFamilyCsv.forEach(row => {
      const fid = row.muni_id;
      const totalHouseholds = parseFloat(row.hh || 0);

      // Income level percentages
      if (totalHouseholds > 0) {
        const percentages = incomeLevelGroups.map(group => {
          let sum = 0;
          group.forEach(col => {
            sum += parseFloat(row[col] || 0);
          });
          return sum / totalHouseholds; // fraction
        });
        incomeCache.set(parseInt(fid), percentages);
      } else {
        incomeCache.set(parseInt(fid), [0, 0, 0, 0, 0, 0]);
      }
    });

    // Build demographic cache
    complianceCsv.forEach(row => {
      const fid = row.muni_id;
      const totalPopulation = parseFloat(row.pop || 0);

      // Demographic group percentages
      if (totalPopulation > 0) {
        const demoPercentages = {};
        for (const [label, columnName] of Object.entries(demographicColumns)) {
          demoPercentages[label] = columnName[1];
        }
        demoCache.set(fid, demoPercentages);
      } else {
        const zeroPercentages = {};
        for (const label of Object.keys(demographicColumns)) {
          zeroPercentages[label] = 0;
        }
        demoCache.set(fid, zeroPercentages);
      }
    });

    // Build timeline cache
    timelineDataMap = new Map();
    Object.entries(yearMuniAcc).forEach(([year, municipalities]) => {
      Object.entries(municipalities).forEach(([muni, totalUnits]) => {
        if (!timelineDataMap.has(muni)) {
          timelineDataMap.set(muni, []);
        }
        timelineDataMap.get(muni).push({
          year: parseInt(year),
          totalUnits: parseFloat(totalUnits || 0)
        });
      });
    });

    // After filling timelineDataMap
    timelineMaxUnits = d3.max(
      Array.from(timelineDataMap.entries()).map(([muni, entries]) => 
        entries.reduce((sum, entry) => sum + entry.totalUnits, 0)
      )
    );

    const incomeMidpoints = {
      incu10: 5000,
      inc1015: 12500,
      inc1520: 17500,
      inc2025: 22500,
      inc2530: 27500,
      inc3035: 32500,
      inc3540: 37500,
      inc4045: 42500,
      inc4550: 47500,
      inc5060: 55000,
      inc6075: 67500,
      i7599: 87500,
      i100125: 112500,
      i125150: 137500,
      i150200: 175000,
      in200o: 225000  // assume $225k for >200k
    };

    // Create merged version just for scatterplot use
    let mergedSingleFamilyCsv = [];

    const muniMergeMap = new Map();

    singleFamilyCsv.forEach(row => {
      const muniName = row.muni?.trim().toLowerCase();
      if (!muniName) return; // skip if no name

      if (!muniMergeMap.has(muniName)) {
        muniMergeMap.set(muniName, { ...row, count: 1 });
      } else {
        const existing = muniMergeMap.get(muniName);
        
        // Sum up all numeric fields
        for (const key in row) {
          if (key !== 'muni' && key !== 'fid' && !isNaN(parseFloat(row[key]))) {
            existing[key] = (parseFloat(existing[key]) || 0) + (parseFloat(row[key]) || 0);
          }
        }
        existing.count += 1;
      }
    });

    // Now create the merged list
    mergedSingleFamilyCsv = Array.from(muniMergeMap.values()).map(row => ({
      ...row,
      fid: row.fid, // optional, doesn't really matter for scatterplot
      muni: row.muni
    }));

    scatterData = mergedSingleFamilyCsv.map(row => {
      let totalIncome = 0;
      let totalHouseholds = 0;

      for (const [col, midpoint] of Object.entries(incomeMidpoints)) {
        const count = parseFloat(row[col] || 0);
        totalIncome += count * midpoint;
        totalHouseholds += count;
      }

      const averageIncome = totalHouseholds > 0 ? totalIncome / totalHouseholds : null;
      const unitPrice = unitPriceMap.get(row.muni?.trim().toLowerCase()) || null;

      return {
        muni: row.muni,
        avgIncome: averageIncome,
        avgUnitPrice: unitPrice,
      };
    }).filter(d => d.avgIncome !== null && d.avgUnitPrice !== null);

    console.log('Scatter Data', scatterData);
  }

  function onSearch(event) {
    const selected = event.target.value.trim();
    selectedMuni = selected || null;

    const circles = d3.select("#scatterplot svg g").selectAll("circle");

    circles
      .attr("r", d => (d.muni === selectedMuni ? 11 : 7))
      .attr("stroke-width", d => (d.muni === selectedMuni ? 1.5 : 0.1))
      .attr("opacity", d => (d.muni === selectedMuni ? 1 : 0.85));

    if (selectedMuni) {
      const match = scatterData.find(d => d.muni === selectedMuni);

      tooltip.transition().duration(200).style("opacity", 0.9);
      tooltip.html(`
        <strong>${match.muni}</strong><br/>
        <b>Avg Income:</b> ${formatMillions(match.avgIncome)}<br/>
        <b>Avg Unit Price:</b> ${formatMillions(match.avgUnitPrice)}<br/>
        <b>Years to Pay Off:</b> ${match.yearsToPayoff.toFixed(1)}
      `);

      const svgElement = document.querySelector("#scatterplot svg");
      const pt = svgElement.createSVGPoint();
      pt.x = x(match.avgIncome);
      pt.y = y(match.avgUnitPrice);
      const screenPoint = pt.matrixTransform(svgElement.getScreenCTM());
      const scatterRect = svgElement.getBoundingClientRect();

      tooltip
        .style("left", (screenPoint.x - scatterRect.left + 80) + "px")
        .style("top", (screenPoint.y - scatterRect.top + 30) + "px");

      // 🛠️ MOST IMPORTANT PART: move the selected circle to the front
      circles.filter(d => d.muni === selectedMuni).raise();
    } else {
      tooltip.transition().duration(300).style("opacity", 0);
    }
  }

  async function initZoningMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    zoningMap = new mapboxgl.Map({
      container: 'income-map', // Make sure your HTML map container ID matches
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude, latitude],
      zoom: zoom,
      minZoom: 8.5,
      attributionControl: true,
      interactive: true
    });

    zoningMap.on('load', () => {
      updateIncomeLayer(); // Draw initial map
    });
  }

  function initBarChart() {
    const margin = { top: 40, right: 30, bottom: 70, left: 80 };
    const width = 1000 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    barSvg = d3.select("#timeline-map")
      .append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("transform", `translate(${margin.left},${margin.top})`);

    barX = d3.scaleBand()
      .range([0, width])
      .padding(0.2);

    barY = d3.scaleLinear()
      .domain([0, timelineMaxUnits]) // ✅ fix the domain once
      .range([height, 0]);

    barSvg.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`);

    barSvg.append("g")
      .attr("class", "y-axis");

    // X-axis label
    barSvg.append("text")
      .attr("text-anchor", "middle")
      .attr("x", (1000 - 80 - 30) / 2)  // width minus margins divided by 2
      .attr("y", 500 - 40 + 50)          // height minus top margin plus some padding
      .text("Municipality")
      .style("font-size", "14px");

    // Y-axis label
    barSvg.append("text")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -(500 - 40 - 70) / 2)   // height minus margins divided by 2
      .attr("y", -60)                    // place it to the left of y-axis
      .text("Total Units Built (up to selected year)")
      .style("font-size", "14px");
  }

  function updateBarChart(selectedYear) {

    barSvg.selectAll(".muni-group").remove(); 

    const data = Array.from(timelineDataMap.entries())
      .map(([muni, entries]) => {
        return {
          muni, // muni is already the municipality name
          totalUnits: entries
            .filter(entry => entry.year <= selectedYear)
            .reduce((sum, entry) => sum + entry.totalUnits, 0)
        };
      })
      .filter(d => d && d.totalUnits > 0);

    // console.log("Bar Chart Data:", data);

    // Update X and Y domain
    barX.domain(data.map(d => d.muni));

    // 🧱 Define how thick each "brick" is vertically
    const brickHeightUnits = 200000; // 5000 housing units per brick (you can adjust)
    const maxBricks = d3.max(data, d => Math.ceil(d.totalUnits / brickHeightUnits));

  // barY.domain([0, brickHeightUnits * maxBricks]);

  barSvg.select(".x-axis")
    .transition()
    .duration(500)
    .call(d3.axisBottom(barX))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "10px");

  barSvg.select(".y-axis")
    .transition()
    .duration(500)
    .call(d3.axisLeft(barY));

  // const bars = barSvg.selectAll(".bar")
  //   .data(data, d => d.muni);

  // bars.enter()
  //   .append("rect")
  //   .attr("class", "bar")
  //   .attr("x", d => barX(d.muni))
  //   .attr("width", barX.bandwidth())
  //   .attr("y", barY(0)) // Start from 0 for animation
  //   .attr("height", 0)
  //   .attr("fill", "#69b3a2")
  //   .transition()
  //   .duration(500)
  //   .attr("y", d => barY(d.totalUnits))
  //   .attr("height", d => barY(0) - barY(d.totalUnits));

  // bars.transition()
  //   .duration(500)
  //   .attr("x", d => barX(d.muni))
  //   .attr("width", barX.bandwidth())
  //   .attr("y", d => barY(d.totalUnits))
  //   .attr("height", d => barY(0) - barY(d.totalUnits))
  //   .attr("fill", "#69b3a2");

  // bars.exit().remove();
  const muniGroups = barSvg.selectAll(".muni-group")
    .data(data, d => d.muni);

  const muniGroupsEnter = muniGroups.enter()
    .append("g")
    .attr("class", "muni-group")
    .attr("transform", d => `translate(${barX(d.muni)},0)`);

  // Remove old
  muniGroups.exit().remove();

  muniGroupsEnter.each(function(d) {
  const group = d3.select(this);
  const numBricks = Math.floor(d.totalUnits / brickHeightUnits);

//   group.selectAll(".brick")
//     .data(d3.range(numBricks)) // Create an array [0,1,2,...,numBricks-1]
//     .enter()
//     .append("rect")
//     .attr("class", "brick")
//     .attr("x", 0)
//     .attr("width", barX.bandwidth())
//     .attr("y", barY(0)) // Start at bottom
//     .attr("height", 0) // Start collapsed
//     .attr("fill", "#69b3a2")
//     .transition()
//     .duration(800)
//     .delay((_, i) => i * 30) // slight delay per brick for rising animation
//     .attr("y", (i) => barY((i + 1) * brickHeightUnits))
//     .attr("height", (_, i) => barY(i * brickHeightUnits) - barY((i + 1) * brickHeightUnits));
// });
  //   const brickHeight = (barY(0) - barY(brickHeightUnits)); 
  //   // How many pixels tall 1 brick should be

  //   group.selectAll(".brick")
  // .data(d3.range(numBricks))
  // .enter()
  // .append("image")
  // .attr("xlink:href", (d, i) => (i % 2 === 0 ? "/images/lego_block.png" : "/images/lego_block.png")) // alternate colors
  // .attr("width", barX.bandwidth())
  // .attr("height", brickHeight)
  // .attr("x", 0)
  // .attr("y", () => barY(0)) // Start collapsed at bottom
  // .transition()
  // .duration(200)
  // .delay((_, i) => i * 30)
  // .attr("y", (i) => barY(d.totalUnits) + i * brickHeight);
  // });

  group.selectAll(".brick")
    .data(d3.range(numBricks))
    .enter()
    .append("image")
    .attr("xlink:href", "/images/lego_block.png") // 🧱 your lego piece
    .attr("width", barX.bandwidth())
    .attr("height", 90)  // 🧱 each brick height
    .attr("x", 0)
    .attr("y", barY(0))
    .transition()
    .duration(100)
    .delay((_, i) => i * 30)
    // .attr("y", (i) => barY((i) * brickHeightUnits));
    .attr("y", (i) => barY((i + 6) * brickHeightUnits))
  });
}

  function onTabChange(tabName) {
    activeTab = tabName;

    // Remove all existing layers and sources before switching
    if (zoningMap.getLayer('income-layer')) zoningMap.removeLayer('income-layer');
    if (zoningMap.getLayer('income-highlight')) zoningMap.removeLayer('income-highlight');
    if (zoningMap.getSource('income-source')) zoningMap.removeSource('income-source');

    if (zoningMap.getLayer('demo-layer')) zoningMap.removeLayer('demo-layer');
    if (zoningMap.getLayer('demo-highlight')) zoningMap.removeLayer('demo-highlight');
    if (zoningMap.getSource('demo-source')) zoningMap.removeSource('demo-source');

    if (zoningMap.getLayer('family-layer')) zoningMap.removeLayer('family-layer');
    if (zoningMap.getLayer('family-highlight')) zoningMap.removeLayer('family-highlight');
    if (zoningMap.getSource('family-source')) zoningMap.removeSource('family-source');

    // Load the correct layer depending on the new active tab
    if (activeTab === 'income') {
      updateIncomeLayer();
    } else if (activeTab === 'demographics') {
      updateDemographicsLayer();
    } else if (activeTab === 'family') {
      updateFamilyLayer();
    }
  }

  function updateIncomeLayer() {
    console.log(activeTab);
    if (activeTab !== 'income') {
      return; // Do nothing if not on "By Income" tab
    }

    let maxIncomeValue = 0;
    if (!usePercentage) {
      // Find the maximum absolute value to normalize
      singleFamilyGeo.features.forEach(f => {
        const fid = f.properties.mapc_muni_id;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));
        if (csvRow) {
          const group = incomeLevelGroups[selectedIncomeLevel];
          let sum = 0;
          group.forEach(col => {
            sum += parseFloat(csvRow[col] || 0);
          });
          if (sum > maxIncomeValue) {
            maxIncomeValue = sum;
          }
        }
      });
    }

    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.mapc_muni_id;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));

        let normalizedValue = 0;
        let rawCounts = 0;

        if (csvRow) {
          const group = incomeLevelGroups[selectedIncomeLevel];
          rawCounts = group.reduce((sum, col) => {
            return sum + parseFloat(csvRow[col] || 0);
          }, 0);

          if (usePercentage) {
            const percentages = incomeCache.get(fid) || [0, 0, 0, 0, 0, 0];
            normalizedValue = percentages[selectedIncomeLevel] || 0;
          } else {
            normalizedValue = (maxIncomeValue > 0) ? (rawCounts / maxIncomeValue) : 0;
          }
        }

        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            income_value: normalizedValue, // for painting
            income_raw: rawCounts          // for hover info
          }
        };
      })
    };

    if (zoningMap.getSource('income-source')) {
      zoningMap.getSource('income-source').setData(updatedGeojson);
    } else {
      zoningMap.addSource('income-source', {
        type: 'geojson',
        data: updatedGeojson
      });

      const labelLayerId = zoningMap.getStyle().layers.find(
        l => l.type === 'symbol' && l.layout?.['text-field']
      )?.id;

      zoningMap.addLayer({
        id: 'income-layer',
        type: 'fill',
        source: 'income-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'income_value'],
            0.0,  '#ffffb2',
            0.25, '#fdbb84',
            0.5,  '#fc4e2a',
            0.75, '#9932cc',
            1.0,  '#4b0082'
          ],
          'fill-opacity': 0.7,
          'fill-outline-color': '#000'
        }
      }, labelLayerId); // 👈 this ensures income-layer is added *below* labels

      // Hover outline layer (dark green)
      zoningMap.addLayer({
        id: 'income-highlight',
        type: 'line',
        source: 'income-source',
        paint: {
          'line-color': '#801fb8', // DARK GREEN color
          'line-width': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'hover'], false],
              ['boolean', ['feature-state', 'selected'], false]
            ],
            2,
            0
          ]
        }
      });

      let selectedFeatureId = null;
      let hoveredFeatureId = null;

      zoningMap.on('click', 'income-layer', (e) => {
        const feature = e.features[0];
        const props = feature.properties;

        if (selectedFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'income-source', id: selectedFeatureId },
            { selected: false }
          );
        }
        selectedFeatureId = feature.id;
        zoningMap.setFeatureState(
          { source: 'income-source', id: selectedFeatureId },
          { selected: true }
        );

        // Update the fixed info box
        const muniName = props.mapc_municipal
          ? props.mapc_municipal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
          : 'Unknown';
        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          let displayValue;
          if (usePercentage) {
            displayValue = (props.income_value * 100).toFixed(1) + '%';
          } else {
            displayValue = Math.round(props.income_raw || 0).toLocaleString(); // Format raw count nicely
          }

          const fid = props.mapc_muni_id;
          const csvRow = singleFamilyCsvData.get(parseInt(fid));

          const incomeValues = incomeLevelGroups.map((group, i) => {
            let count = 0;
            group.forEach(col => {
              count += parseFloat(csvRow?.[col] || 0);
            });

            return {
              label: `Group ${i + 1}`, // or use real income range labels
              index: i,
              value: count
            };
          });

          const muniName = props.mapc_municipal
            ? props.mapc_municipal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
            : 'Unknown';

          infoBox.innerHTML = `
            <div style="width: 170px;">
              <strong>${muniName}</strong><br/>
              <span style="font-size: 0.9rem; color: #555; display: inline-block; line-height: 1.4;">Distribution of households by income bracket:</span><br/>
              <svg id="donut-chart" width="120" height="120"></svg>
            </div>
          `;

          const svg = d3.select("#donut-chart");
          svg.selectAll("*").remove();

          const width = 120, height = 120, radius = 50;
          const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);

          const pie = d3.pie().value(d => d.value);
          const arc = d3.arc().innerRadius(30).outerRadius(radius);

          // pop-out effect for selected slice
          g.selectAll("path")
            .data(pie(incomeValues))
            .enter()
            .append("path")
            .attr("fill", d => colorScale(d.data.label))
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .attr("d", arc)
            .attr("transform", d => {
              if (d.data.index === selectedIncomeLevel) {
                const [x, y] = arc.centroid(d);
                return `translate(${x * 0.2}, ${y * 0.2})`; // ⬅️ explode selected slice
              }
              return null;
            });

          // center label for value
          const valueToDisplay = usePercentage
            ? ((props.income_value || 0) * 100).toFixed(1) + '%'
            : Math.round(props.income_raw || 0).toLocaleString();

          g.append("text")
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("font-size", "14px")
            .attr("font-family", "inherit")
            .attr("fill", "#333")
            .text(valueToDisplay);
        }
      });

      zoningMap.on('click', (e) => {
        // ✅ Only run this logic if income-layer exists
        if (zoningMap.getLayer('income-layer')) {
          const features = zoningMap.queryRenderedFeatures(e.point, {
            layers: ['income-layer']
          });

          if (features.length === 0 && selectedFeatureId !== null) {
            if (zoningMap.getSource('income-source')) {
              zoningMap.setFeatureState(
                { source: 'income-source', id: selectedFeatureId },
                { selected: false }
              );
            }

            selectedFeatureId = null;

            const infoBox = document.getElementById('hover-info');
            if (infoBox) {
              infoBox.innerHTML = '<i>Click a municipality to explore housing details</i>';
            }
          }
        }
      });

      zoningMap.on('mousemove', 'income-layer', (e) => {
        const feature = e.features[0];

        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'income-source', id: hoveredFeatureId },
            { hover: false }
          );
        }

        hoveredFeatureId = feature.id;

        if (hoveredFeatureId !== selectedFeatureId) {
          zoningMap.setFeatureState(
            { source: 'income-source', id: hoveredFeatureId },
            { hover: true }
          );
        }
      });

      zoningMap.on('mouseleave', 'income-layer', () => {
        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'income-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = null;
      });
    }
  }

  function updateDemographicsLayer() {
    console.log(activeTab);
    if (activeTab !== 'demographics') {
      return;
    }

    const selectedColumn = demographicColumns[selectedDemographic];

    if (!selectedColumn) {
      console.error("Invalid demographic selection:", selectedDemographic);
      return;
    }

    // Find the maximum value for the selected demographic
    let maxDemoValue = 0;
    if (!usePercentage) {
      complianceCsvData.forEach(row => {
        const val = parseFloat(row[selectedColumn[0]] || 0);
        if (val > maxDemoValue) {
          maxDemoValue = val;
        }
      });
    }

    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.mapc_muni_id;
        const csvRow = complianceCsvData.get(parseInt(fid));

        let percentages = 0;
        let rawCount = 0;

        if (csvRow) {
          if (usePercentage) {
            percentages = parseFloat(csvRow[selectedColumn[1]] || 0) / 100;
          } else {
            rawCount = parseFloat(csvRow[selectedColumn[0]] || 0);
            // Apply log-normalization to spread values more evenly
            if (maxDemoValue > 0 && rawCount > 0) {
              percentages = Math.log(rawCount + 1) / Math.log(maxDemoValue + 1);
            } else {
              percentages = 0;
            }
          }
        }

        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            demo_value: percentages,
            demo_raw: rawCount,
          }
        };
      })
    };

    if (zoningMap.getSource('demo-source')) {
      zoningMap.getSource('demo-source').setData(updatedGeojson);
    } else {
      zoningMap.addSource('demo-source', {
        type: 'geojson',
        data: updatedGeojson
      });

      // Add fill layer
      const labelLayerId = zoningMap.getStyle().layers.find(
        l => l.type === 'symbol' && l.layout?.['text-field']
      )?.id;

      zoningMap.addLayer({
        id: 'demo-layer',
        type: 'fill',
        source: 'demo-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'demo_value'],
            0,   '#c6dbef',
            0.2, '#9ecae1',
            0.4, '#6baed6',
            0.6, '#4292c6',
            0.8, '#2171b5',
            1.0, '#084594'
          ],
          'fill-opacity': 0.7,
          'fill-outline-color': '#000'
        }
      }, labelLayerId);  // 👈 Insert below the first label layer

      // Add hover layer
      zoningMap.addLayer({
        id: 'demo-highlight',
        type: 'line',
        source: 'demo-source',
        paint: {
          'line-color': '#000',
          'line-width': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'hover'], false],
              ['boolean', ['feature-state', 'selected'], false]
            ],
            2,
            0
          ]
        }
      });

      // Hover behavior
      let selectedFeatureId = null;
      let hoveredFeatureId = null;

      zoningMap.on('click', 'demo-layer', (e) => {
        const feature = e.features[0];
        const props = feature.properties;

        if (selectedFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'demo-source', id: selectedFeatureId },
            { selected: false }
          );
        }
        selectedFeatureId = feature.id;
        zoningMap.setFeatureState(
          { source: 'demo-source', id: selectedFeatureId },
          { selected: true }
        );

        const fid = props.mapc_muni_id;
        const csvRow = complianceCsvData.get(parseInt(fid));

        const demoValues = Object.entries(demographicColumns).map(([label, cols]) => {
          const percent = parseFloat(csvRow?.[cols[1]] || 0); // already %
          return { label, value: percent };
        });

        const muniName = props.mapc_municipal
          ? props.mapc_municipal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
          : 'Unknown';
        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          let displayValue;
          if (usePercentage) {
            // format percentage with 1 decimal place
            displayValue = (props.demo_value * 100).toFixed(1) + '%';
          } else {
            displayValue = props.demo_raw.toLocaleString(); // format raw counts with commas
          }

          infoBox.innerHTML = `
            <div style="width: 170px;">
              <strong>${muniName}</strong><br/>
              <span style="font-size: 0.9rem; color: #555; display: inline-block; line-height: 1.4;">Distribution of households by demographic group:</span><br/>
              <svg id="donut-chart" width="120" height="120"></svg>
            </div>
          `;

          const svg = d3.select("#donut-chart");
          svg.selectAll("*").remove(); // clear previous

          const width = 120, height = 120, radius = 50;
          const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);

          const pie = d3.pie().value(d => d.value);
          const arc = d3.arc().innerRadius(30).outerRadius(radius);

          g.selectAll("path")
            .data(pie(demoValues))
            .enter()
            .append("path")
            .attr("fill", d => colorScale(d.data.label))
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .attr("d", arc)
            .attr("transform", d => {
              if (d.data.label === selectedDemographic) {
                const [x, y] = arc.centroid(d);
                return `translate(${x * 0.2}, ${y * 0.2})`; // ⬅️ explode selected slice
              }
              return null;
            });

          // Center label for selected group percentage or raw count
          const selectedData = demoValues.find(d => d.label === selectedDemographic);
          if (selectedData) {
            const centerLabel = usePercentage
              ? `${selectedData.value.toFixed(1)}%`
              : Math.round(parseFloat(csvRow?.[demographicColumns[selectedDemographic][0]] || 0)).toLocaleString();

            g.append("text")
              .attr("text-anchor", "middle")
              .attr("alignment-baseline", "middle")
              .attr("font-size", "14px")
              .attr("font-family", "inherit")
              .attr("fill", "#333")
              .text(centerLabel);
          }
        }
      });

      zoningMap.on('click', (e) => {
        if (zoningMap.getLayer('demo-layer')) {
          const features = zoningMap.queryRenderedFeatures(e.point, {
            layers: ['demo-layer']
          });

          if (features.length === 0 && selectedFeatureId !== null) {
            zoningMap.setFeatureState(
              { source: 'demo-source', id: selectedFeatureId },
              { selected: false }
            );
            selectedFeatureId = null;

            const infoBox = document.getElementById('hover-info');
            if (infoBox) {
              infoBox.innerHTML = '<i>Click a municipality to explore housing details</i>';
            }
          }
        }
      });
      
      zoningMap.on('mousemove', 'demo-layer', (e) => {
        const feature = e.features[0];

        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'demo-source', id: hoveredFeatureId },
            { hover: false }
          );
        }

        hoveredFeatureId = feature.id;

        if (hoveredFeatureId !== selectedFeatureId) {
          zoningMap.setFeatureState(
            { source: 'demo-source', id: hoveredFeatureId },
            { hover: true }
          );
        }
      })

      zoningMap.on('mouseleave', 'demo-layer', () => {
        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'demo-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = null;
      });
    }
  }

  function updateFamilyLayer() {
    console.log(activeTab);
    if (activeTab !== 'family') {
      return;
    }

    const selectedColumn = familySizeOptions[selectedFamilySizeOption];

    if (!selectedColumn) {
      console.error("Invalid family size selection:", selectedFamilySizeOption);
      return;
    }

    // First, find the max value if using absolute mode
    let maxFamilyCount = 0;
    if (!usePercentage) {
      singleFamilyCsvData.forEach(row => {
        const val = parseFloat(row[selectedColumn] || 0);
        if (val > maxFamilyCount) {
          maxFamilyCount = val;
        }
      });
    }

    // Create updated GeoJSON with family size percentage
    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.mapc_muni_id;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));
        const hhTotal = parseFloat(csvRow?.hh || 0);
        const count = parseFloat(csvRow?.[selectedColumn] || 0) || 0;

        let value = 0;
        if (usePercentage) {
          value = (hhTotal > 0) ? (count / hhTotal) : 0;
        } else {
          value = (maxFamilyCount > 0) ? (count / maxFamilyCount) : 0;
        }

        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            family_value: value  // <- unified field!
          }
        };
      })
    };

    if (zoningMap.getSource('family-source')) {
      zoningMap.getSource('family-source').setData(updatedGeojson);
    } else {
      // Add source
      zoningMap.addSource('family-source', {
        type: 'geojson',
        data: updatedGeojson
      });

      // Add fill layer
      const labelLayerId = zoningMap.getStyle().layers.find(
        l => l.type === 'symbol' && l.layout?.['text-field']
      )?.id;

      zoningMap.addLayer({
        id: 'family-layer',
        type: 'fill',
        source: 'family-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'family_value'],
            0,    '#fddbc7',  // deeper than before, light coral
            0.05, '#fcae91',  // orange-coral
            0.15, '#fb6a4a',  // rich orange-red
            0.3,  '#de2d26',  // red
            0.5,  '#a50f15',  // dark red
            0.7,  '#7f0000',  // very dark red
            1.0,  '#4d0000'   // almost maroon (deepest)
          ],
          'fill-opacity': 0.7,
          'fill-outline-color': '#000'
        }
      }, labelLayerId);  // 👈 Insert below label layer

      // Add hover layer
      zoningMap.addLayer({
        id: 'family-highlight',
        type: 'line',
        source: 'family-source',
        paint: {
          'line-color': '#801fb8', // black outline on hover
          'line-width': [
            'case',
            ['any',
              ['boolean', ['feature-state', 'hover'], false],
              ['boolean', ['feature-state', 'selected'], false]
            ],
            2,
            0
          ]
        }
      });

      // Hover behavior
      let selectedFeatureId = null;
      let hoveredFeatureId = null;

      zoningMap.on('click', 'family-layer', (e) => {
        const feature = e.features[0];
        const props = feature.properties;

        if (selectedFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'family-source', id: selectedFeatureId },
            { selected: false }
          );
        }
        selectedFeatureId = feature.id;
        zoningMap.setFeatureState(
          { source: 'family-source', id: selectedFeatureId },
          { selected: true }
        );

        const muniName = props.mapc_municipal
          ? props.mapc_municipal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
          : 'Unknown';

        const csvRow = singleFamilyCsvData.get(parseInt(feature.id));
        const hhTotal = parseFloat(csvRow?.hh || 0);

        const familyValues = Object.entries(familySizeOptions).map(([label, col]) => {
          const count = parseFloat(csvRow?.[col] || 0);
          return {
            label,
            value: usePercentage && hhTotal > 0 ? (count / hhTotal) * 100 : count
          };
        });

        const selectedData = familyValues.find(d => d.label === selectedFamilySizeOption);
        const centerText = usePercentage
          ? `${selectedData.value.toFixed(1)}%`
          : Math.round(selectedData.value).toLocaleString();

        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          infoBox.innerHTML = `
            <div style="width: 170px;">
              <strong>${muniName}</strong><br/>
              <span style="font-size: 0.9rem; color: #555; display: inline-block; line-height: 1.4;">Distribution of households by family size:</span><br/>
              <svg id="donut-chart" width="120" height="120"></svg>
            </div>
          `;

          const svg = d3.select("#donut-chart");
          svg.selectAll("*").remove();

          const width = 120, height = 120, radius = 50;
          const g = svg.append("g").attr("transform", `translate(${width / 2}, ${height / 2})`);

          const pie = d3.pie().value(d => d.value);
          const arc = d3.arc().innerRadius(30).outerRadius(radius);
          const color = d3.scaleOrdinal().domain(familyValues.map(d => d.label)).range(d3.schemeSet3);

          g.selectAll("path")
            .data(pie(familyValues))
            .enter()
            .append("path")
            .attr("fill", d => colorScale(d.data.label))
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .attr("d", arc)
            .attr("transform", d => {
              if (d.data.label === selectedFamilySizeOption) {
                const [x, y] = arc.centroid(d);
                return `translate(${x * 0.2}, ${y * 0.2})`; // ⬅️ explode selected slice
              }
              return null;
            });

          g.append("text")
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("font-size", "14px")
            .attr("font-family", "inherit")
            .attr("fill", "#333")
            .text(centerText);
        }
      });

      zoningMap.on('click', (e) => {
        if (zoningMap.getLayer('family-layer')) {
          const features = zoningMap.queryRenderedFeatures(e.point, {
            layers: ['family-layer']
          });

          if (features.length === 0 && selectedFeatureId !== null) {
            zoningMap.setFeatureState(
              { source: 'family-source', id: selectedFeatureId },
              { selected: false }
            );
            selectedFeatureId = null;

            const infoBox = document.getElementById('hover-info');
            if (infoBox) {
              infoBox.innerHTML = '<i>Click a municipality to explore housing details</i>';
            }
          }
        }
      });

      zoningMap.on('mousemove', 'family-layer', (e) => {
        const feature = e.features[0];

        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'family-source', id: hoveredFeatureId },
            { hover: false }
          );
        }

        hoveredFeatureId = feature.id;

        if (hoveredFeatureId !== selectedFeatureId) {
          zoningMap.setFeatureState(
            { source: 'family-source', id: hoveredFeatureId },
            { hover: true }
          );
        }
      });

      zoningMap.on('mouseleave', 'family-layer', () => {
        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'family-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = null;
      });
    }
  }

  function onIncomeChange(event) {
    selectedIncomeLevel = parseInt(event.target.value);
    updateIncomeLayer();
  }

  function onDemographicChange(event) {
    selectedDemographic = event.target.value;
    updateDemographicsLayer();
  }

  function onFamilySizeChange(event) {
    selectedFamilySizeOption = event.target.value;
    updateFamilyLayer();
  }

  // Helper function to format millions nicely
  function formatMillions(value) {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else {
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  }

  function onTimelineChange(event) {
    selectedYear = parseInt(event.target.value);
    updateBarChart(selectedYear);
  }

  function initScatterplot() {
    const margin = { top: 40, right: 80, bottom: 60, left: 70 };
    const containerWidth = document.getElementById("scatterplot").offsetWidth;
    const width = containerWidth - margin.left - margin.right;
    const height = 550 - margin.top - margin.bottom;

    // Define the legend size first
    const legendHeight = 400;
    const legendWidth = 40;

    svg = d3.select("#scatterplot")
      .append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("font-family", "Lato, sans-serif")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`); // 🛠️ Correct transform here!

    x = d3.scaleLinear()
      .domain(d3.extent(scatterData, d => d.avgIncome))
      .nice()
      .range([0, width]);

    y = d3.scaleLinear()
      .domain([0, d3.max(scatterData, d => d.avgUnitPrice) * 1.05]) // little padding
      .range([height, 0]);

    scatterData.forEach(d => {
      if (d.avgIncome && d.avgUnitPrice) {
        const loanAmount = 0.91 * d.avgUnitPrice; // after 9% down payment
        const annualPayment = 0.28 * d.avgIncome; // 28% of yearly income
        d.yearsToPayoff = loanAmount / annualPayment;
      } else {
        d.yearsToPayoff = null; // ❗ set clearly if missing
      }
    });


    // 🧠 Fix color scale domain
    const payoffExtent = d3.extent(scatterData, d => d.yearsToPayoff);
    const color = d3.scaleSequential(d3.interpolateBlues)
      .domain([0, 50]); 

    // X Axis
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("$.2s")));

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 50)
      .attr("text-anchor", "middle")
      .text("Average Household Yearly Income ($)")
      .style("font-size", "14px");

    // Y Axis
    svg.append("g")
      .call(d3.axisLeft(y).tickFormat(d => d >= 1000000 ? `$${d/1000000}M` : d3.format("$.2s")(d)));

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -50)
      .attr("text-anchor", "middle")
      .text("Average Household Unit Purchase Price ($)")
      .style("font-size", "14px");

    // Add transparent background rect to detect clicks
    svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent") 
    .lower() // put it behind everything
    .on("click", () => {
      selectedMuni = null;

      // Reset all circles appearance
      const circles = d3.select("#scatterplot svg g").selectAll("circle");
      circles
        .attr("r", 7)
        .attr("stroke-width", 0.1)
        .attr("opacity", 0.85);

      // Hide tooltip
      tooltip.transition().duration(300).style("opacity", 0);

      // Reset dropdown to placeholder
      const selectElement = document.getElementById("searchSelect");
      if (selectElement) {
        selectElement.value = "";
      }
    });

    // Scatter points
    svg.selectAll("circle")
      .data(scatterData)
      .enter()
      .append("circle")
      .attr("cx", d => x(d.avgIncome))
      .attr("cy", d => y(d.avgUnitPrice))
      .attr("r", 7) // 🌟 Bigger dots
      .attr("fill", d => (d.yearsToPayoff !== null ? color(Math.min(d.yearsToPayoff, 50)) : "#ccc")) 
      .attr("stroke", "black")        // 👈 add this line
      .attr("stroke-width", 0.1)      // 👈 very thin outline
      .attr("opacity", 0.85);

    // Create a tooltip div
    tooltip = d3.select("#scatterplot")
      .append("div")
      .style("position", "absolute")
      .style("background", "white")
      .style("padding", "8px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "6px")
      .style("pointer-events", "none")
      .style("font-size", "12px")
      .style("opacity", 0);

    // Animate tooltip when mouseover circle
    svg.selectAll("circle")
    .on("mouseover", (event, d) => {
      const scatterplotRect = document.getElementById('scatterplot').getBoundingClientRect();

      tooltip.transition().duration(200).style("opacity", 0.9);
      tooltip.html(`
        <strong>${d.muni}</strong><br/>
        <b>Avg Income:</b> ${formatMillions(d.avgIncome)}<br/>
        <b>Avg Unit Price:</b> ${formatMillions(d.avgUnitPrice)}<br/>
        <b>Years to Pay Off:</b> ${d.yearsToPayoff.toFixed(1)}
      `)
        .style("left", (event.clientX - scatterplotRect.left + 10) + "px")
        .style("top", (event.clientY - scatterplotRect.top - 20) + "px");
    })
    .on("mousemove", (event) => {
      const scatterplotRect = document.getElementById('scatterplot').getBoundingClientRect();

      tooltip.style("left", (event.clientX - scatterplotRect.left + 10) + "px")
            .style("top", (event.clientY - scatterplotRect.top - 20) + "px");
    })
    .on("mouseout", () => {
      tooltip.transition().duration(300).style("opacity", 0);
    });


    // Dashed Red Line (10-year affordability line)
    svg.append("line")
      .attr("x1", x.range()[0])
      .attr("y1", y(10 * d3.min(scatterData, d => d.avgIncome)))
      .attr("x2", x.range()[1])
      .attr("y2", y(10 * d3.max(scatterData, d => d.avgIncome)))
      .attr("stroke", "red")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    // Add a group (g) for the red dashed line legend
    const lineLegend = svg.append("g")
      .attr("transform", `translate(${width - 300}, 20)`); // move to top right corner nicely

    // Draw a red dashed sample line inside
    lineLegend.append("line")
      .attr("x1", 0)
      .attr("y1", 10)
      .attr("x2", 40)
      .attr("y2", 10)
      .attr("stroke", "red")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    // Text next to it
    lineLegend.append("text")
      .attr("x", 50)
      .attr("y", 15)
      .text("Units purchasable with 10 years income")
      .style("font-size", "12px")
      .style("alignment-baseline", "middle")
      .attr("fill", "#555");

    // Surround the legend group with a rectangle
    const legendBox = lineLegend.node().getBBox();

    lineLegend.insert("rect", ":first-child") // insert the box behind everything
      .attr("x", legendBox.x - 10)
      .attr("y", legendBox.y - 5)
      .attr("width", legendBox.width + 20)
      .attr("height", legendBox.height + 10)
      .attr("rx", 6) // rounded corners
      .attr("ry", 6)
      .attr("fill", "white")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1.5);


    // 📦 Legend
    const defs = svg.append("defs");

    const linearGradient = defs.append("linearGradient")
      .attr("id", "legend-gradient")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "0%");

    linearGradient.selectAll("stop")
      .data(d3.range(0, 1.01, 0.01))
      .enter()
      .append("stop")
      .attr("offset", d => `${d*100}%`)
      .attr("stop-color", d => color(d * 50)); // because domain is [50,0]

    const legendSvg = svg.append("g")
      .attr("transform", `translate(${width + 20},${height/2 - legendHeight/2})`);

    legendSvg.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#legend-gradient)");

    const legendScale = d3.scaleLinear()
      .domain([50, 0]) // top to bottom
      .range([0, legendHeight]);

    legendSvg.append("g")
      .attr("transform", `translate(${legendWidth},0)`)
      .call(d3.axisRight(legendScale).ticks(6));

    legendSvg.append("text")
      .attr("x", -30)
      .attr("y", -20)
      .attr("text-anchor", "start")
      .style("font-size", "12px")
      .text("Years to Pay Off");
  }

  onMount(async () => {
    await loadData();
    await initScatterplot();
    await initZoningMap();
    await initBarChart();
    await updateBarChart(selectedYear);

    const sections = document.querySelectorAll("section");
    const navLinks = document.querySelectorAll(".nav-dots a");

    function activateCurrentNavDot() {
      const scrollPos = window.scrollY + window.innerHeight / 2;

      let currentSection = sections[0]; // fallback
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const sectionTop = window.scrollY + rect.top;
        const sectionBottom = sectionTop + rect.height;

        if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
          currentSection = section;
          break;
        }
      }

      navLinks.forEach(link => link.classList.remove("active"));

      const activeId = currentSection.getAttribute("id");
      const activeLink = [...navLinks].find(link => link.getAttribute("href") === `#${activeId}`);
      if (activeLink) activeLink.classList.add("active");
    }

    window.addEventListener("scroll", activateCurrentNavDot);
    await activateCurrentNavDot(); // Trigger once on load
  });

</script>

<svelte:head>
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css"
    rel="stylesheet"
  />
  <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet">
</svelte:head>

<main>
  <section id="home" style="
  padding: 120px 20px;
  text-align: center;
  background: linear-gradient(135deg, #f9f4ef 0%, #e8e3dc 100%);
  position: relative;
  overflow: hidden;
">
  <!-- Decorative shapes -->
  <div style="
    position: absolute;
    top: -50px;
    right: -50px;
    width: 200px;
    height: 200px;
    background: rgba(248, 214, 197, 0.3);
    border-radius: 50%;
    z-index: 0;
  "></div>
  <div style="
    position: absolute;
    bottom: 20px;
    left: -30px;
    width: 150px;
    height: 150px;
    background: rgba(248, 214, 197, 0.2);
    border-radius: 30% 70% 70% 30%;
    z-index: 0;
  "></div>

  <!-- Content container -->
  <div style="position: relative; z-index: 1; max-width: 900px; margin: 0 auto;">
    <h1 style="
      font-size: 3.2rem;
      font-weight: 800;
      margin-bottom: 25px;
      color: #3a3229;
      line-height: 1.2;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.05);
      animation: fadeInUp 0.8s ease-out;
    ">
      Reforming Zoning for<br> <span style="color: #d4a593;">Affordable Housing</span>
    </h1>

    <p style="
      font-size: 1.4rem;
      color: #5c5145;
      max-width: 700px;
      margin: 0 auto 40px;
      line-height: 1.6;
      animation: fadeInUp 0.8s ease-out 0.2s both;
    ">
      Discover how zoning shapes your opportunities — and how reforms can unlock more affordable housing options for everyone.
    </p >

    <a href="#history-intro" style="
      display: inline-block;
      padding: 10px 24px;
      background-color: #F8D6C5;
      color: #5c5145;
      font-size: 1.1rem;
      font-family: 'Poppins', sans-serif;
      font-weight: 600;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.3s ease;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
      animation: fadeInUp 0.8s ease-out 0.4s both;
      position: relative;
      overflow: hidden;
    ">
      <span style="position: relative; z-index: 2;">Start Exploring</span>
      <span style="
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 100%;
        background-color: rgba(255,255,255,0.2);
        transition: width 0.3s ease;
        z-index: 1;
      "></span>
    </a >
  </div>

  <style>
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    #home a:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.1);
    }
    #home a:hover span:last-child {
      width: 100%;
    }
  </style>
</section>

<section id="history-intro" style="padding: 60px 20px 40px 20px; background: #f9f4ef;">
  <div class="section-header" style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center;">The Evolution of Zoning in Boston</div>

  <div style="text-align: center; margin-bottom: 2rem;">
    <!-- <img src="{import.meta.env.BASE_URL}images/zoninglaws.jpg" alt="Zoning Laws Timeline" 
      style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" /> -->
    <img src="images/zoninglaws.jpg" alt="Zoning Laws Timeline" 
      style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
  </div>

  <div style="max-width: 800px; margin: 0 auto;">
    <!-- Combined Beginning + Shift -->
    <div style="margin-bottom: 2.5rem;">
      <h3 style="font-size: 1.5rem; color: #5c5145; margin-bottom: 1rem;">From Planning to Exclusion</h3>
      <p style="font-size: 1.15rem; line-height: 1.7; color: #333; margin-bottom: 1rem;">
        In the early 1900s, zoning laws were created to organize land use and improve public safety. 
        But by the 1920s in Boston, these rules became tools for <strong style="color: #5c5145;">segregation</strong>, 
        deliberately limiting housing access for marginalized groups through single-family zoning 
        and restrictive building codes.
      </p >
      <p style="font-style: italic; font-size: 1rem; color: #777; text-align: center;">
        The map of the city was being redrawn — but not for everyone's benefit
      </p >
    </div>

    <!-- Combined Impact + Future -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 2rem;">
      <div>
        <h3 style="font-size: 1.5rem; color: #5c5145; margin-bottom: 1rem;">Lasting Consequences</h3>
        <p style="font-size: 1.15rem; line-height: 1.7; color: #333;">
          These policies created <strong>lasting divides</strong> — today's housing prices, 
          neighborhood segregation, and limited affordable options still reflect 
          century-old zoning choices.
        </p >
        <div style="text-align: center; margin: 1.5rem 0;">
          <!-- <img src="{import.meta.env.BASE_URL}images/figure1.jpg" alt="Zoning Impact"
            style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" /> -->
          <img src="images/figure1.jpg" alt="Zoning Impact"
            style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
        </div>
      </div>

      <div>
        <h3 style="font-size: 1.5rem; color: #5c5145; margin-bottom: 1rem;">Pathways to Reform</h3>
        <p style="font-size: 1.15rem; line-height: 1.7; color: #333;">
          Cities like Minneapolis are proving change is possible by eliminating 
          <em>single-family-only zoning</em>. Boston now faces a choice: 
          maintain exclusionary systems or create <strong style="color: #5c5145;">inclusive communities</strong> 
          through zoning reform.
        </p >
        <p style="font-style: italic; font-size: 1rem; color: #777; margin-top: 1.5rem;">
          We can build a better future — if we change how we plan it.
        </p >
      </div>
    </div>
  </div>
</section>


<section id="key-takeaways" style="max-width: 1200px; margin: 3rem auto; padding: 0 20px;">
    <h2 style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center;">Navigating Boston's Housing Landscape</h2>

    <div style="background: #f9f4ef; border-radius: 12px; padding: 2.5rem;">
      <h3 style="font-size: 1.8rem; color: #5c5145; margin-bottom: 1.5rem; text-align: center;">Explore Our Interactive Tools</h3>
      <p style="font-size: 1.2rem; line-height: 1.6; margin-bottom: 2.5rem; text-align: center;">
        Use our visual tools to uncover trends in housing affordability, neighborhood demographics, and new development patterns across Greater Boston:
      </p>

      <div style="display: flex; flex-wrap: nowrap; gap: 2rem; justify-content: center;">
        <!-- Tool 1: Scatterplot -->
        <div style="flex: 1; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); text-align: center;">
          <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">💬 <br><br>Affordability Explorer</h4>
          <p style="font-size: 1.1rem;">Compare average household incomes to home purchase prices across municipalities.</p>
          <ul style="text-align: left; margin-top: 1rem; padding-left: 1.5rem; font-size: 1.0rem; line-height: 1.6;">
            <li>Identify affordable and unaffordable regions</li>
            <li>Hover to view detailed municipality-level data</li>
            <li>Highlight specific towns via search</li>
          </ul>
          <a href="#price" style="display: inline-block; margin-top: 1.5rem; padding: 10px 20px; background: #F8D6C5; color: #5c5145; border-radius: 6px; font-weight: 600; text-decoration: none;">Explore</a>
        </div>

        <!-- Tool 2: Timeline -->
        <div style="flex: 1; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); text-align: center;">
          <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">📅 <br><br> Housing Growth Timeline</h4>
          <p style="font-size: 1.1rem;">Track the expansion of new housing units across Greater Boston municipalities from 1980 to 2025.</p>
          <ul style="text-align: left; margin-top: 1rem; padding-left: 1.5rem; font-size: 1.0rem; line-height: 1.6;">
            <li>Adjust the year slider to see cumulative housing built up to a selected year.</li>
            <li>Compare towns to spot where growth has accelerated — or slowed.</li>
          </ul>
          <a href="#timeline" style="display: inline-block; margin-top: 1.5rem; padding: 10px 20px; background: #F8D6C5; color: #5c5145; border-radius: 6px; font-weight: 600; text-decoration: none;">Explore</a>
        </div>

        <!-- Tool 3: Interactive Housing Explorer -->
        <div style="flex: 1; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); text-align: center;">
          <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">🗺️ <br><br> Interactive Housing Explorer</h4>
          <p style="font-size: 1.1rem;">Filter and map neighborhoods based on household income, demographics, or family size.</p>
          <ul style="text-align: left; margin-top: 1rem; padding-left: 1.5rem; font-size: 1.0rem; line-height: 1.6;">
            <li>Switch between income, demographic, and family size</li>
            <li>Toggle between density or absolute numbers</li>
            <li>Compare access and opportunity across regions</li>
          </ul>
          <a href="#map" style="display: inline-block; margin-top: 1.5rem; padding: 10px 20px; background: #F8D6C5; color: #5c5145; border-radius: 6px; font-weight: 600; text-decoration: none;">Explore</a>
        </div>
      </div>

      <div style="margin-top: 3rem; background: #F8D6C5; padding: 1.5rem; border-radius: 8px;">
        <h4 style="font-size: 1.4rem; margin-top: 0; color: #5c5145;">Why It Matters:</h4>
        <ul style="font-size: 1.1rem; margin-bottom: 0; line-height: 1.6;">
          <li>Expose the mismatch between incomes and housing costs</li>
          <li>Uncover where housing growth has accelerated — or stalled</li>
          <li>Highlight zoning barriers and the path to inclusive reform</li>
        </ul>        
      </div>
    </div>
  </section>

  <section id="price" class="alt-bg">
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; min-height: 100vh;">
      <!-- LEFT: Text Content -->
      <div style="flex: 1; min-width: 300px; background-color: rgba(255, 255, 255, 0.9); padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div class="section-header">Affordability Explorer</div>
      </div>

      <!-- RIGHT: Scatterplot -->
      <div style="flex: 2; min-width: 500px; padding: 2rem 6rem 2rem 2rem;">
        <div class="scatterplot-title">Average Household Income vs. Unit Purchase Price</div>
        <div class="scatterplot-subtitle">Hover over each dot to see which municipality it represents.</div>
    
        <div style="margin-bottom: 20px; text-align: center;">
          <select id="searchSelect" class="form-select" style="width: 300px;" on:change={onSearch}>
            <option value="">Select Municipality...</option>
            {#each [...scatterData].sort((a, b) => a.muni.localeCompare(b.muni)) as d}
              <option value={d.muni}>{d.muni}</option>
            {/each}
          </select>                 
        </div>

        <div style="padding: 1rem; background-color: white; border-radius: 12px;">
          <div id="scatterplot" style="position: relative;"></div>
        </div>
      </div>
  </section>      

  <section id="timeline" class="alt-bg">
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; min-height: 100vh;">
      <!-- LEFT: Text Content -->
      <div style="flex: 1; min-width: 300px; background-color: rgba(255, 255, 255, 0.9); padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div class="section-header">Emergence of New Housing Over Time</div>
      </div>
      <!-- RIGHT: Timeline Map -->
      <div style="flex: 2; min-width: 500px; padding: 2rem 6rem 2rem 2rem;">
        <!-- Flex Row: Search + Year slider -->
        <div class="container-fluid d-flex justify-content-between align-items-center mb-4" style="max-width: 1200px; padding: 0 2rem;">
          <!-- Left: Search Box -->
          <div class="d-flex align-items-center gap-2">
            <!-- <input
              type="text"
              placeholder="Search municipality..."
              class="search-box"
              bind:value={searchQuery}
              on:input={onSearch}
            /> -->
          </div>
      
          <!-- Right: Year Label + Slider -->
          <div class="d-flex align-items-center gap-3">
            <span class="fw-bold" style="font-size: 1rem;">Year Selected: {selectedYear}</span>
            <div class="slider-wrapper" style="width: 450px;">
              <div class="slider-track">
                <!-- (optional tick marks, similar to income slider) -->
              </div>
              <input
                type="range"
                min="1980"
                max="2025"
                step="1"
                bind:value={selectedYear}
                on:input={onTimelineChange}
                class="form-range custom-slider"
              />
            </div>
          </div>
        </div>
      
        <!-- Map Container -->
        <div class="d-flex justify-content-center">
          <div class="box" style="height: 600px; width: 100%; max-width: 1200px; background-color: #e9e3d9;">
            <div id="timeline-map" style="position: relative; height: 100%; width: 100%;">
              <!-- Timeline Mapbox will go here -->
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>    

  <section id="map" class="alt-bg">
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; min-height: 100vh;">
      <!-- LEFT: Text Content -->
      <div style="flex: 1; min-width: 300px; background-color: rgba(255, 255, 255, 0.9); padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div class="section-header">Housing Access Across Communities</div>
      </div>
      <!-- RIGHT: Map -->
      <div style="flex: 2; min-width: 500px; padding: 3rem 6rem 2rem 2rem; display: flex; flex-direction: column; align-items: center;">
        <!-- Combined Row: Tabs (left) + Selector (right) -->
        <div style="width: 100%; max-width: 1200px; margin-bottom: 1.5rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; font-size: 0.9rem;">
          <!-- Tabs -->
          <ul class="nav nav-tabs mb-0" id="housingTabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link custom-tab" class:active={activeTab === 'income'} type="button" on:click={() => onTabChange('income')}>By Income</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link custom-tab" class:active={activeTab === 'demographics'} type="button" on:click={() => onTabChange('demographics')}>By Demographics</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link custom-tab" class:active={activeTab === 'family'} type="button" on:click={() => onTabChange('family')}>By Family Size</button>
            </li>
          </ul>

          <!-- Conditional Selector -->
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            {#if activeTab === 'income'}
              <label for="incomeRange" class="form-label fw-bold mb-0">Income Level</label>
              <div class="slider-wrapper" style="width: 350px;">
                <div class="slider-track">
                  <div class="slider-segment"></div>
                  <div class="slider-segment"></div>
                  <div class="slider-segment"></div>
                  <div class="slider-segment"></div>
                  <div class="slider-segment"></div>
                </div>
                <input id="incomeRange" type="range" min="0" max="5" step="1" bind:value={selectedIncomeLevel} on:input={onIncomeChange} class="form-range custom-slider" />
                <div class="slider-labels">
                  <span>&lt;25k</span><span>25k–50k</span><span>50k–100k</span><span>100k–150k</span><span>150k–200k</span><span>&gt;200k</span>
                </div>
              </div>
            {/if}
            {#if activeTab === 'demographics'}
              <label for="demographicSelect" class="form-label fw-bold mb-0">Demographic Type</label>
              <select id="demographicSelect" class="form-select" style="width: 300px;" bind:value={selectedDemographic} on:change={onDemographicChange}>
                {#each Object.keys(demographicColumns) as demo}
                  <option value={demo}>{demo}</option>
                {/each}
              </select>
            {/if}
            {#if activeTab === 'family'}
              <label for="familySizeSelect" class="form-label fw-bold mb-0">Family Size</label>
              <select id="familySizeSelect" class="form-select" style="width: 300px;" bind:value={selectedFamilySizeOption} on:change={onFamilySizeChange}>
                {#each Object.keys(familySizeOptions) as sizeLabel}
                  <option value={sizeLabel}>{sizeLabel}</option>
                {/each}
              </select>
            {/if}
          </div>
        </div>

        <div class="tab-content" style="width: 100%; max-width: 1200px;">
          <!-- By Income Tab -->
          <div class="tab-pane fade show active" id="income" role="tabpanel" >
            <div style="display: flex; justify-content: center; width: 100%;">
              <div class="box" style="height: 600px; width: 100%; background-color: #e9e3d9;">
                <div id="income-map" style="position: relative; height: 100%; width: 100%;">
                  <!-- Density toggle in top-left corner of map -->
                  <div style="position: absolute; top: 16px; left: 16px; z-index: 10;">
                    <div class="density-toggle-switch">
                      <input 
                        type="checkbox" 
                        id="densitySwitch" 
                        class="toggle-input" 
                        bind:checked={usePercentage}
                        on:change={() => { onTabChange(activeTab); }}
                      />
                      <label class="toggle-label" style="font-size: 0.9rem" for="densitySwitch">
                        <span class="toggle-text">{usePercentage ? 'Density (%)' : 'Absolute #'}</span>
                        <span class="toggle-thumb"></span>
                      </label>
                    </div>
                  </div>
            
                  <!-- Legend and hover-info -->
                  <div id="legend">
                    {#if activeTab === 'income'}
                      <div class="income-legend-gradient"></div>
                    {:else if activeTab === 'demographics'}
                      <div class="demographics-legend-gradient"></div>
                    {:else if activeTab === 'family'}
                      <div class="family-legend-gradient"></div>
                    {/if}
                    <div class="legend-labels">
                      {#if usePercentage}
                        <span class="legend-label top">100%</span>
                        <span class="legend-label middle">50%</span>
                        <span class="legend-label bottom">0%</span>
                      {:else}
                        <span class="legend-label top">high</span>
                        <span class="legend-label middle">mid</span>
                        <span class="legend-label bottom">0</span>
                      {/if}
                    </div>                    
                  </div>
                  <div id="hover-info" class="info-box">
                    <i>Click a municipality to explore housing details</i>
                  </div>
                </div>
              </div>
            </div>            
          </div>          

          <!-- By Demographics Tab -->
          <div class="tab-pane fade" id="demographics" role="tabpanel">
            <div class="row g-4 justify-content-center">
              <div class="col-md-8">
                <div class="box" style="height: 500px; background-color: #e9e3d9;">
                  <div class="d-flex justify-content-center align-items-center h-100 text-dark">
                    [ Demographic-Based Interactive Map ]
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- By Family Size Tab -->
          <div class="tab-pane fade" id="family" role="tabpanel">
            <div class="row g-4 justify-content-center">
              <div class="col-md-4">
                <div class="box">
                  <label for="familySize" class="form-label fw-bold">Family Size</label>
                  <select id="familySize" class="form-select">
                    <option>1 person</option>
                    <option>2 people</option>
                    <option>3+</option>
                  </select>
                </div>
              </div>
              <div class="col-md-8">
                <div class="box" style="height: 500px; background-color: #e9e3d9;">
                  <div class="d-flex justify-content-center align-items-center h-100 text-dark">
                    [ Family Size-Based Interactive Map ]
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

</main>
  
<footer>
    Blueprint Boston | Sophie Suo, Cynthia Qi, Tiffany Wang | Spring 2025
</footer>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Montserrat:wght@700&display=swap');

  :root {
  --primary-warm: #deb7b0;     /* Muted Rose */
  --secondary-warm: #f4edea;   /* Soft Blush Beige */
  --accent-deep: #a68ba5;      /* Dusty Mauve */
  --neutral-main: #6f5a69;     /* Muted Plum Taupe */
  --neutral-light: #e4dce6;    /* Pale Lilac Gray */
  --accent-hope: #baa6d0;      /* Lavender */
}

  main {
      font-family: 'Lato', sans-serif;
      background-color: #fdf8f2;
      color: var(--neutral-main);
      margin: 0;
      padding: 0;
      scroll-behavior: smooth;
  }

  .nav-dots {
      position: fixed;
      top: 50%;
      right: 2rem;
      transform: translateY(-50%);
      z-index: 1000;
  }

  .nav-dots a {
      display: block;
      margin: 1.5rem 0;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: #333;
      transition: background-color 0.3s;
      position: relative;
  }


  /* Tooltip styling */
  .nav-dots a::after {
    content: attr(data-tooltip);
    position: absolute;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(60, 60, 60, 0.85);
    color: white;
    padding: 5px 8px;
    font-size: 0.8rem;
    border-radius: 4px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s, transform 0.3s;
  }

  /* Show tooltip on hover */
  .nav-dots a:hover::after {
    opacity: 1;
    transform: translateY(-50%) translateX(-5px);
  }

  .nav-dots a:hover {
    background-color: var(--accent-hope);
  }

  :global(.nav-dots a.active) {
    background-color: #baa6d0 !important; /* pastel purple */
    transform: scale(1.3);
  }

  section {
    /* padding: 6rem 4rem; */
    /* padding: 0rem 2rem; */
    border-bottom: 1px solid #e0d6c6;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .section-header {
      font-family: 'Montserrat', sans-serif;
      font-size: 2rem;
      font-weight: 700;
      text-align: center;
      margin-bottom: 2rem;
  }

  .box {
      background-color: #ffffff;
      border: 1px solid #ddd4c5;
      padding: 2rem;
      margin-bottom: 2rem;
  }

  .analysis-box {
      padding-left: 1rem;
      font-style: italic;
      color: var(--neutral2);
      border-left: 4px solid var(--accent-hope);
      background: #f6fdf6;
  }

  footer {
      background-color: var(--accent-hope);
      color: white;
      text-align: center;
      padding: 2rem 1rem;
      font-size: 0.9rem;
  }

  .alt-bg {
    background-color: var(--secondary-warm); 
  }

  .section-intro {
    font-size: 1.2rem;
    text-align: center;
    max-width: 700px;
    margin: 1rem auto 2rem auto;
    color: var(--neutral-main);
  }

  .custom-tab {
    border: 2px solid var(--accent-hope); /* lavender border */
    border-radius: 8px;
    padding: 6px 12px;
    background-color: white;
    color: var(--neutral-main);
    margin-right: 8px;
    font-weight: 500;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .custom-tab:hover {
    background-color: var(--accent-hope);
    color: white;
  }

  .custom-tab.active {
    background-color: var(--accent-hope);
    /* color: white; */
    box-shadow: 0 0 0 2px var(--accent-hope);
  }

  .slider-wrapper {
    position: relative;
    width: 450px;
  }

  .slider-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 6px;
    background-color: var(--accent-hope);
    border-radius: 3px;
    transform: translateY(-50%);
    z-index: 1;
  }

  .slider-segment {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: var(--neutral-main);
  }

  /* Position each segment evenly */
  .slider-segment:nth-child(1) { left: 21%; }
  .slider-segment:nth-child(2) { left: 40%; }
  .slider-segment:nth-child(3) { left: 59.5%; }
  .slider-segment:nth-child(4) { left: 79%; }
  .slider-segment:nth-child(5) { left: 98%; }
  /* Slider itself */
  .custom-slider {
      position: relative;
      z-index: 2;
      background: transparent;
      height: 0px; /* <<< lower this! */
      width: 100%;
      margin: 0;
      pointer-events: all;
  }

  /* Thumb */
  .custom-slider::-webkit-slider-thumb {
      background-color: var(--accent-hope);
      border: none;
      width: 16px;   /* <<< match size better */
      height: 16px;
      margin-top: -6px; /* <<< center it vertically over the track */
  }

  .custom-slider::-moz-range-thumb {
      background-color: var(--accent-hope);
      border: none;
      width: 16px;
      height: 16px;
  }

  /* Labels below */
  .slider-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 0.8rem;
    color: var(--neutral-main);
  }

  /* Tabs - fix inactive color */
  .nav-tabs .nav-link {
    color: var(--neutral-main); /* deep taupe color for inactive tabs */
  }

  /* Active tab stays coral */
  .nav-tabs .nav-link.active {
    background-color: var(--accent-hope);
    color: white;
    border-color: var(--accent-hope) var(--accent-hope) white;
  }

  #legend {
    position: absolute;
    top: 50%;
    right: 30px;
    transform: translateY(-50%);
    width: auto;
    height: 200px;
    display: flex;
    flex-direction: row; /* ← horizontal layout */
    align-items: center;
    font-size: 0.8rem;
    background: white;
    padding: 8px 12px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 10;
  }

  .income-legend-gradient {
    width: 12px;
    height: 100%;
    background: linear-gradient(
      to top,
      #ffffb2,  /* low income */
      #fdbb84,
      #fc4e2a,
      #9932cc,
      #4b0082   /* high income */
    );
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .demographics-legend-gradient {
    width: 12px;
    height: 100%;
    background: linear-gradient(
      to top,
      #c6dbef 0%,     /* was #f7fbff → now a soft but visible blue */
      #9ecae1 20%,    /* slightly stronger */
      #6baed6 40%,    /* medium light blue */
      #4292c6 60%,    /* medium */
      #2171b5 80%,    /* medium dark */
      #084594 100%    /* dark navy blue */
    );
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .family-legend-gradient {
    width: 12px;
    height: 100%;
    background: linear-gradient(
      to top,
      #fddbc7 0%,   /* deeper light coral */
      #fcae91 5%,   /* coral-orange */
      #fb6a4a 15%,  /* strong orange-red */
      #de2d26 30%,  /* red */
      #a50f15 50%,  /* dark red */
      #7f0000 70%,  /* very dark red */
      #4d0000 100%  /* maroon */
    );
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .legend-labels {
    position: relative;
    height: 100%;
    width: 25px;
  }

  .legend-label {
    position: absolute;
    left: 3px;
    transform: translateY(-50%);
    font-size: 0.8rem;
    color: #5c4a56; /* Or match your theme */
  }

  .legend-label.top {
    top: 0%;
    transform: translateY(0); /* top aligned */
  }

  .legend-label.middle {
    top: 50%; /* center aligned */
  }

  .legend-label.bottom {
    top: 100%;
    transform: translateY(-100%); /* bottom aligned */
  }

  .info-box {
    position: absolute;
    top: 20px;
    right: 30px;
    background-color: white;
    padding: 10px 15px;
    border: 2px solid #801fb8; /* dark green border */
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-size: 0.9rem;
    color: #333;
    min-width: 180px;
    z-index: 10;
  }

  .density-toggle-switch {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 0rem;
    position: relative;
  }

  .toggle-input {
    display: none; /* hide the raw checkbox */
  }

  .toggle-label {
    width: 120px;
    height: 35px;
    background-color: var(--accent-hope); /* soft sage green */
    border-radius: 50px;
    display: flex;
    align-items: center;
    justify-content: flex-end; /* <<-- default to right */
    padding: 0 12px;
    position: relative;
    cursor: pointer;
    font-weight: bold;
    font-size: 0.75rem;
    color: white;
    transition: all 0.3s;
    overflow: hidden;
  }

  .toggle-thumb {
    position: absolute;
    left: 1px;
    top: 4px;
    width: 27px;
    height: 27px;
    background-color: white;
    border-radius: 50%;
    transition: all 0.3s ease;
    z-index: 2;
  }

  .toggle-input:checked + .toggle-label {
    justify-content: flex-start; /* when checked, move text to left */
  }

  .toggle-input:checked + .toggle-label .toggle-thumb {
    transform: translateX(90px); /* move thumb right */
  }

  .toggle-text {
    z-index: 1;
    white-space: nowrap;
    transition: all 0.3s;
  }

  .history-content {
    max-width: 850px;
    margin: 0 auto;
    text-align: center;
  }

  .history-text {
    font-size: 1.1rem;
    line-height: 1.7;
    color: var(--neutral-main);
    margin-bottom: 2rem;
    text-align: justify;
  }

  .history-image-container {
    margin-bottom: 2rem;
  }

  .history-image {
    max-width: 100%;
    height: auto;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  }

  .image-caption {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: var(--neutral-main);
    font-style: italic;
  }

  .history-subtext {
    font-size: 1rem;
    color: var(--neutral-main);
    margin-top: 2rem;
    text-align: center;
  }

  .scatterplot-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: var(--neutral-main);
  }

  .scatterplot-subtitle {
    font-size: 1.2rem;
    color: var(--neutral-main);
    margin-bottom: 1rem;
  }

  .scatterplot-fullwidth {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto 2rem auto;
    padding: 2rem;
    background: white;
    border: 1px solid #ddd4c5;
    border-radius: 16px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
  }

  .search-box {
    width: 280px;
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    color: var(--neutral-main);
    background-color: white;
    border: 1px solid var(--neutral-light);
    /* border-radius: 50px; */
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    transition: all 0.3s ease;
  }

  .search-box::placeholder {
    color: var(--neutral-main);
    opacity: 0.6;
    font-style: italic;
  }

  .search-box:focus {
    outline: none;
    border-color: var(--accent-hope);
    box-shadow: 0 0 0 3px rgba(166,185,163,0.3);
  }
  #scatterplot {
    position: relative;
  }

</style>

<div class="nav-dots">
  <a href="#home" data-tooltip="Home" class="home-icon"></a>
  <a href="#history-intro" data-tooltip="History"></a>
  <a href="#key-takeaways" data-tooltip="Key Takeaways"></a>
  <a href="#price" data-tooltip="Affordability"></a>
  <a href="#timeline" data-tooltip="Timeline"></a>
  <a href="#map" data-tooltip="Explorer"></a>
</div>
