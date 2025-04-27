<script>
  import { onMount } from "svelte";
  import mapboxgl from "mapbox-gl";
  import * as d3 from "d3";

  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  let longitude = -71.1;
  let latitude = 42.38;
  let zoom = 8.5;

  let zoningMap;
  let singleFamilyGeo;
  let singleFamilyCsvData = new Map();
  let activeTab = 'income'; // default tab
  let usePercentage = true; // true = show %; false = show raw counts

  // Precomputed cache
  let incomeCache = new Map();
  let demoCache = new Map();

   // Scatterplot data
   let scatterData = [];

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
    'Non-Hispanic White': 'nhwhi',
    'Non-Hispanic Black': 'nhaa',
    'Non-Hispanic American Indian': 'nhna',
    'Non-Hispanic Asian': 'nhas',
    'Non-Hispanic Pacific Islander': 'nhpi',
    'Non-Hispanic Other Race': 'nhoth',
    'Non-Hispanic Multi-Race': 'nhmlt',
    'Hispanic or Latino': 'lat'
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

  async function loadData() {
    const singleFamilyCsv = await d3.csv('/single_family_zoning/housing_sf_other_w_census.csv');
    singleFamilyGeo = await fetch('/single_family_zoning/housing_sf_other_w_census_reprojected.json').then(res => res.json());

    const unitPriceCsv = await d3.csv('/scatterplot/average_unit_price_by_municipality.csv');

    // Build CSV map
    singleFamilyCsvData = new Map();
    singleFamilyCsv.forEach(row => {
      singleFamilyCsvData.set(parseInt(row.fid), row);
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
      const fid = row.fid;
      const totalHouseholds = parseFloat(row.hh || 0);
      const totalPopulation = parseFloat(row.pop || 0);

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

      // Demographic group percentages
      if (totalPopulation > 0) {
        const demoPercentages = {};
        for (const [label, columnName] of Object.entries(demographicColumns)) {
          const count = parseFloat(row[columnName] || 0);
          demoPercentages[label] = count / totalPopulation; // fraction
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

    console.log("Income Cache: ", incomeCache);
    console.log("Demographics Cache: ", demoCache);

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

    scatterData = singleFamilyCsv.map(row => {
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
        const fid = f.properties.fid;
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
        const fid = f.properties.fid;
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

      // Main colored fill layer
      zoningMap.addLayer({
        id: 'income-layer',
        type: 'fill',
        source: 'income-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'income_value'],
            0, '#e0f3db',
            0.1, '#a8ddb5',
            0.2, '#7bccc4',
            0.4, '#43a2ca',
            0.6, '#0868ac',
            0.8, '#084081'
          ],
          'fill-opacity': 1,
          'fill-outline-color': '#fff'
        }
      });

      // Hover outline layer (dark green)
      zoningMap.addLayer({
        id: 'income-highlight',
        type: 'line',
        source: 'income-source',
        paint: {
          'line-color': '#006400', // DARK GREEN color
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            0
          ]
        }
      });

      let hoveredFeatureId = null;

      zoningMap.on('mousemove', 'income-layer', (e) => {
        const feature = e.features[0];
        const props = feature.properties;
        const fid = props.fid;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));

        // Set feature state
        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'income-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = feature.id;
        zoningMap.setFeatureState(
          { source: 'income-source', id: hoveredFeatureId },
          { hover: true }
        );

        // Update the fixed info box
        const muniName = props.muni || 'Unknown';
        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          let displayValue;
          if (usePercentage) {
            displayValue = (props.income_value * 100).toFixed(1) + '%';
          } else {
            displayValue = Math.round(props.income_raw || 0).toLocaleString(); // Format raw count nicely
          }

          infoBox.innerHTML = `
            <strong>${muniName}</strong><br/>
            <b>${usePercentage ? 'Density:' : 'Number of Households:'}</b> ${displayValue}
          `;
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

        // Clear info box
        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          infoBox.innerHTML = '<i>Hover over a municipality</i>';
        }
      });
    }
  }

  function updateDemographicsLayer() {
    console.log(activeTab);
    if (activeTab !== 'demographics') {
      return;
    }

    let maxDemoValue = 0;
    if (!usePercentage) {
      singleFamilyGeo.features.forEach(f => {
        const fid = f.properties.fid;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));
        if (csvRow && demographicColumns[selectedDemographic]) {
          const count = parseFloat(csvRow[demographicColumns[selectedDemographic]] || 0);
          if (count > maxDemoValue) {
            maxDemoValue = count;
          }
        }
      });
    }

    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.fid;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));

        let normalizedValue = 0;
        let rawCount = 0;

        if (csvRow && demographicColumns[selectedDemographic]) {
          rawCount = parseFloat(csvRow[demographicColumns[selectedDemographic]] || 0);
          if (usePercentage) {
            const pop = parseFloat(csvRow.pop || 0);
            normalizedValue = (pop > 0) ? (rawCount / pop) : 0;
          } else {
            normalizedValue = (maxDemoValue > 0) ? (rawCount / maxDemoValue) : 0;
          }
        }

        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            demo_value: normalizedValue,
            demo_raw: rawCount
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
      zoningMap.addLayer({
        id: 'demo-layer',
        type: 'fill',
        source: 'demo-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'demo_value'],
            0, '#f7fbff',        // very pale blue (0%)
            0.1, '#d2e3f3',      // light blue
            0.3, '#a6bddb',      // mid blue
            0.5, '#74a9cf',      // medium-deep blue
            0.7, '#2b8cbe',      // deep blue
            0.9, '#045a8d'       // dark blue
          ],
          'fill-opacity': 1,
          'fill-outline-color': '#fff'
        }
      });

      // Add hover layer
      zoningMap.addLayer({
        id: 'demo-highlight',
        type: 'line',
        source: 'demo-source',
        paint: {
          'line-color': '#000',
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            0
          ]
        }
      });

      // Hover behavior
      let hoveredFeatureId = null;

      zoningMap.on('mousemove', 'demo-layer', (e) => {
        const feature = e.features[0];
        const props = feature.properties;

        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'demo-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = feature.id;
        zoningMap.setFeatureState(
          { source: 'demo-source', id: hoveredFeatureId },
          { hover: true }
        );

        const muniName = props.muni || 'Unknown';
        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          let displayValue;
          if (usePercentage) {
            displayValue = (props.demo_value * 100).toFixed(1) + '%';
          } else {
            displayValue = Math.round(props.demo_raw || 0).toLocaleString(); // format raw counts with commas
          }

          infoBox.innerHTML = `
            <strong>${muniName}</strong><br/>
            <b>${usePercentage ? 'Density:' : 'Population Count:'}</b> ${displayValue}
          `;
        }
      });

      zoningMap.on('mouseleave', 'demo-layer', () => {
        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'demo-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = null;

        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          infoBox.innerHTML = '<i>Hover over a municipality</i>';
        }
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
        const fid = f.properties.fid;
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
      zoningMap.addLayer({
        id: 'family-layer',
        type: 'fill',
        source: 'family-source',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'family_value'],
            0, '#fff7ec',     // very pale orange (near white)
            0.02, '#fee8c8',  // pale orange
            0.05, '#fdbb84',  // orange
            0.1, '#fc8d59',   // darker orange
            0.2, '#ef6548',   // red-orange
            0.4, '#d7301f',   // red
            0.6, '#990000'    // dark red
          ],
          'fill-opacity': 1,
          'fill-outline-color': '#fff'
        }
      });

      // Add hover layer
      zoningMap.addLayer({
        id: 'family-highlight',
        type: 'line',
        source: 'family-source',
        paint: {
          'line-color': '#000', // black outline on hover
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            0
          ]
        }
      });

      // Hover behavior
      let hoveredFeatureId = null;

      zoningMap.on('mousemove', 'family-layer', (e) => {
        const feature = e.features[0];
        const props = feature.properties;

        if (hoveredFeatureId !== null) {
          zoningMap.setFeatureState(
            { source: 'family-source', id: hoveredFeatureId },
            { hover: false }
          );
        }
        hoveredFeatureId = feature.id;
        zoningMap.setFeatureState(
          { source: 'family-source', id: hoveredFeatureId },
          { hover: true }
        );

        const muniName = props.muni || 'Unknown';
        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          let displayValue;
          if (usePercentage) {
            displayValue = (props.family_value * 100).toFixed(1) + '%';
          } else {
            displayValue = (props.family_value * maxFamilyCount).toFixed(0); // show raw count!
          }

          infoBox.innerHTML = `
            <strong>${muniName}</strong><br/>
            <b>${usePercentage ? 'Density:' : 'Number of Households:'}</b> ${displayValue}
          `;
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

        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          infoBox.innerHTML = '<i>Hover over a municipality</i>';
        }
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

  function initScatterplot() {
    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const width = 600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select("#scatterplot")
      .append("svg")
      .attr("width", width + margin.left + margin.right + 100)  // leave room for colorbar
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale
    const x = d3.scaleLinear()
      .domain(d3.extent(scatterData, d => d.avgIncome))
      .nice()
      .range([0, width]);

    // Y Scale
    const y = d3.scaleLinear()
      .domain(d3.extent(scatterData, d => d.avgUnitPrice))
      .nice()
      .range([height, 0]);

    // Compute "years to pay off"
    scatterData.forEach(d => {
      d.yearsToPayoff = d.avgUnitPrice / d.avgIncome;
    });

    // Color scale (similar to your matplotlib one)
    const color = d3.scaleSequential(d3.interpolateMagma)
      .domain([0, 70]); // cap at 70 years payoff

    // Axes
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("$.2s")));

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 40)
      .attr("text-anchor", "middle")
      .text("Average Household Yearly Income ($)")
      .style("font-size", "12px");

    svg.append("g")
      .call(d3.axisLeft(y));

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -50)
      .attr("text-anchor", "middle")
      .text("Average Household Unit Purchase Price ($)")
      .style("font-size", "12px");

    // Scatter points
    svg.selectAll("circle")
      .data(scatterData)
      .enter()
      .append("circle")
      .attr("cx", d => x(d.avgIncome))
      .attr("cy", d => y(d.avgUnitPrice))
      .attr("r", 5)
      .attr("fill", d => color(Math.min(d.yearsToPayoff, 70)))
      .attr("opacity", 0.8);

    // Add dashed red line for "10 years of income" = affordable line
    svg.append("line")
      .attr("x1", x.range()[0])
      .attr("y1", y(10 * d3.min(scatterData, d => d.avgIncome)))  // 10×lowest income
      .attr("x2", x.range()[1])
      .attr("y2", y(10 * d3.max(scatterData, d => d.avgIncome)))  // 10×highest income
      .attr("stroke", "red")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    // Legend
    const legendHeight = 200;
    const legendWidth = 20;

    const legendSvg = svg.append("g")
      .attr("transform", `translate(${width + 40},20)`);

    const legendScale = d3.scaleLinear()
      .domain([70, 0])  // reverse to match vertical gradient
      .range([0, legendHeight]);

    const legendAxis = d3.axisRight(legendScale)
      .ticks(6)
      .tickFormat(d => d);

    // Define a gradient
    const defs = svg.append("defs");

    const linearGradient = defs.append("linearGradient")
      .attr("id", "legend-gradient")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "0%");

    const legendStops = d3.range(0, 1.01, 0.01);
    legendStops.forEach(t => {
      linearGradient.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", color(t * 70));
    });

    // Draw the color rect
    legendSvg.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#legend-gradient)");

    // Draw the axis
    legendSvg.append("g")
      .attr("transform", `translate(${legendWidth}, 0)`)
      .call(legendAxis);

    // Legend Label
    legendSvg.append("text")
      .attr("x", 0)
      .attr("y", -10)
      .attr("text-anchor", "start")
      .style("font-size", "12px")
      .text("Years to Pay Off");
  }

  onMount(async () => {
    await loadData();
    initScatterplot();
    await initZoningMap();
  });
</script>

<svelte:head>
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha3/dist/css/bootstrap.min.css"
    rel="stylesheet"
  />
</svelte:head>

<main>
    <section id="hero" class="alt-bg">
        <div class="section-header">Reforming Zoning for Affordable Housing</div>
        <p class="section-intro">
          Explore how zoning affects housing availability and what reforms can mean for you.
        </p>
    </section>

    <section id="history">
      <div class="section-header">History of Zoning in Boston</div>
    
      <div class="history-content">
        <p class="history-text">
          Zoning laws, which originated in the early 20th century, were initially implemented to regulate land use and promote public health, safety, and welfare. However, over time, these laws evolved to introduce practices that segregated neighborhoods along racial and economic boundaries. In Boston, exclusionary zoning can be traced back to the 1920s, when regulations deliberately limited access to affordable housing for marginalized groups. Practices such as single-family zoning and restrictive building types have had lasting effects, contributing to today’s housing crisis by limiting affordable housing supply, raising costs, and deepening racial and class segregation. Recent efforts, such as Minneapolis' reforms, aim to address these inequities by eliminating exclusionary zoning and encouraging diverse housing types.
        </p>
    
        <div class="history-image-container">
          <img src="/images/figure1.jpg" alt="Zoning history in Boston" class="history-image" />
          <div class="image-caption">Figure 1. Early zoning policies shaped Boston’s urban landscape.</div>
        </div>
    
        <p class="history-subtext">
          These historical patterns continue to influence where affordable housing can be built today, perpetuating inequities rooted in zoning’s original design.
        </p>
      </div>
    </section>    

    <section id="price" class="alt-bg">
      <div class="section-header">Income vs Housing Price</div>
      <div class="box text-center" style="height: 400px;">
        <div id="scatterplot" style="width: 100%; height: 100%;"></div>
      </div>
      
      <div class="analysis-box">
      [ What patterns does this graph show? What does it mean for different income levels? ]
      </div>
  </section>

    <section id="availability">
        <div class="section-header">Housing Availability Over Time</div>
        <input type="range" min="1980" max="2025" class="form-range mb-4" />
        <div class="box text-center" style="height: 400px;">
        [ Housing Timeline Map Placeholder ]
        </div>
        <div class="analysis-box">
        [ Discuss trends in development—where, when, and how it impacts communities. ]
        </div>
    </section>

    <section id="map" class="alt-bg">
        <div class="section-header">Interactive Housing Explorer</div>
        <!-- Tabs and Slider side-by-side -->
        <div class="container-fluid d-flex justify-content-between align-items-center mb-4" style="max-width: 1600px; padding: 0 2rem;">
          <ul class="nav nav-tabs" id="housingTabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button 
                class="nav-link custom-tab" 
                class:active={activeTab === 'income'} 
                type="button" 
                on:click={() => onTabChange('income')}
              >
                By Income
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button 
                class="nav-link custom-tab"
                class:active={activeTab === 'demographics'}
                type="button"
                on:click={() => onTabChange('demographics')}
              >
                By Demographics
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button 
                class="nav-link custom-tab" 
                class:active={activeTab === 'family'}
                type="button" 
                on:click={() => onTabChange('family')}
              >
                By Family Size
              </button>
            </li>
          </ul>
          <!-- Switch between percentage and raw counts-->
          <div class="density-toggle-switch">
            <input 
              type="checkbox" 
              id="densitySwitch" 
              class="toggle-input" 
              bind:checked={usePercentage}
              on:change={() => { onTabChange(activeTab); }}
            />
            <label class="toggle-label" for="densitySwitch">
              <span class="toggle-text">{usePercentage ? 'Density (%)' : 'Absolute #'}</span>
              <span class="toggle-thumb"></span>
            </label>
          </div>                        
          <!-- Slider for Income Level -->
          {#if activeTab === 'income'}
          <div class="d-flex align-items-center gap-3">
            <label for="incomeRange" class="form-label fw-bold mb-0" style="min-width: 120px;">Income Level</label>
            <div class="slider-wrapper">
              <div class="slider-track">
                <div class="slider-segment"></div>
                <div class="slider-segment"></div>
                <div class="slider-segment"></div>
                <div class="slider-segment"></div>
                <div class="slider-segment"></div>
              </div>
              <input
                id="incomeRange"
                type="range"
                min="0"
                max="5"
                step="1"
                on:input={onIncomeChange}
                class="form-range custom-slider"
              />
              <div class="slider-labels">
                <span>&lt;25k</span>
                <span>25k–50k</span>
                <span>50k–100k</span>
                <span>100k–150k</span>
                <span>150k–200k</span>
                <span>&gt;200k</span>
              </div>
            </div>
          </div>       
          {/if}
          <!-- Drop down menu for demo groups-->
          {#if activeTab === 'demographics'}
            <div class="d-flex align-items-center gap-3">
              <label for="demographicSelect" class="form-label fw-bold mb-0" style="min-width: 150px;">Demographic Type</label>
              <select id="demographicSelect" class="form-select" style="width: 300px;" on:change={onDemographicChange}>
                {#each Object.keys(demographicColumns) as demo}
                  <option value={demo}>{demo}</option>
                {/each}
              </select>
            </div>
          {/if}
          <!-- Drop down for family size -->
          {#if activeTab === 'family'}
            <div class="d-flex align-items-center gap-3">
              <label for="familySizeSelect" class="form-label fw-bold mb-0" style="min-width: 150px;">Select Family Size</label>
              <select id="familySizeSelect" class="form-select" style="width: 300px;" on:change={onFamilySizeChange}>
                {#each Object.keys(familySizeOptions) as sizeLabel}
                  <option value={sizeLabel}>{sizeLabel}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>

        <div class="tab-content">
          <!-- By Income Tab -->
          <div class="tab-pane fade show active" id="income" role="tabpanel">
            <div class="d-flex justify-content-center">
              <div class="box" style="height: 600px; width: 100%; max-width: 1200px; background-color: #e9e3d9;">
                <div id="income-map" style="position: relative; height: 100%; width: 100%;">
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
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      {:else}
                        <span>0</span>
                        <span>mid</span>
                        <span>high</span>
                      {/if}
                    </div>
                  </div>
                  <div id="hover-info" class="info-box">
                    <i>Hover over a municipality</i>
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
        <!-- <div class="analysis-box">
        [ What do you notice about access, demographics, and income distribution? ]
        </div> -->
    </section>

    <section id="zoning">
        <div class="section-header">Zoning Compliance & Demographics</div>
        <div class="box text-center" style="height: 400px;">
        [ Choropleth Map Placeholder ]
        </div>
        <div class="analysis-box">
        [ Are non-compliant zones overlapping with certain racial or income groups? ]
        </div>
    </section>
  
    <section id="development" class="alt-bg">
        <div class="section-header">New Housing Development</div>
        <div class="box text-center" style="height: 400px;">
        [ New Development Map Placeholder ]
        </div>
        <div class="analysis-box">
        [ What policies have worked? Where are gaps? Tie in back to zoning reform goals. ]
        </div>
    </section>
</main>
  
<footer>
    Blueprint Boston | Sophie Suo, Cynthia Qi, Tiffany Wang | Spring 2025
</footer>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Montserrat:wght@700&display=swap');

  :root {
    --primary-warm: #e98b6d;   /* Soft coral */
    --secondary-warm: #f3ebe3; /* Sand Beige */
    --accent-deep: #a74a44;    /* Brick Red */
    --neutral-main: #7c6757;   /* Deep Taupe */
    --neutral-light: #dad2c9;  /* Soft Gray */
    --accent-hope: #a6b9a3;    /* Sage Green */
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
      left: 2rem;
      transform: translateY(-50%);
      z-index: 1000;
  }

  .nav-dots a {
      display: block;
      margin: 1rem 0;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: #333;
      transition: background-color 0.3s;
  }

  .nav-dots a:hover,
  .nav-dots a.active {
      background-color: var(--accent-hope);
  }

  section {
      padding: 6rem 4rem;
      border-bottom: 1px solid #e0d6c6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
  }

  .section-header {
      font-family: 'Montserrat', sans-serif;
      font-size: 2.5rem;
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

  .custom-tab.active {
    background-color: var(--accent-hope);
    color: white;
    border-color: var(--accent-hope) var(--accent-hope) white;
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
    bottom: 30px;
    right: 30px;
    width: 200px;
    height: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.8rem;
  }

  .income-legend-gradient {
    width: 100%;
    height: 12px;
    background: linear-gradient(
      to right,
      #e0f3db 0%,
      #a8ddb5 10%,
      #7bccc4 20%,
      #43a2ca 40%,
      #0868ac 60%,
      #084081 80%
    );
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .demographics-legend-gradient {
    width: 100%;
    height: 12px;
    background: linear-gradient(
      to right,
      #f7fbff 0%,
      #d2e3f3 10%,
      #a6bddb 30%,
      #74a9cf 50%,
      #2b8cbe 70%,
      #045a8d 90%
    );
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .family-legend-gradient {
    width: 100%;
    height: 12px;
    background: linear-gradient(
      to right,
      #fff7ec 0%,
      #fee8c8 2%,
      #fdbb84 5%,
      #fc8d59 10%,
      #ef6548 20%,
      #d7301f 40%,
      #990000 60%
    );
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .legend-labels {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }

  .info-box {
    position: absolute;
    top: 20px;
    right: 30px;
    background-color: white;
    padding: 10px 15px;
    border: 2px solid #006400; /* dark green border */
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
    margin: 0 2rem;
    position: relative;
  }

  .toggle-input {
    display: none; /* hide the raw checkbox */
  }

  .toggle-label {
    width: 160px;
    height: 44px;
    background-color: var(--accent-hope); /* soft sage green */
    border-radius: 50px;
    display: flex;
    align-items: center;
    justify-content: flex-end; /* <<-- default to right */
    padding: 0 12px;
    position: relative;
    cursor: pointer;
    font-weight: bold;
    font-size: 0.95rem;
    color: white;
    transition: all 0.3s;
    overflow: hidden;
  }

  .toggle-thumb {
    position: absolute;
    left: 4px;
    top: 4px;
    width: 36px;
    height: 36px;
    background-color: white;
    border-radius: 50%;
    transition: all 0.3s ease;
    z-index: 2;
  }

  .toggle-input:checked + .toggle-label {
    justify-content: flex-start; /* when checked, move text to left */
  }

  .toggle-input:checked + .toggle-label .toggle-thumb {
    transform: translateX(116px); /* move thumb right */
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

</style>

<div class="nav-dots">
  <a href="#hero" aria-label="Go to Hero Section"></a>
  <a href="#history" aria-label="Go to History Section"></a>
  <a href="#price" aria-label="Go to Price Section"></a>
  <a href="#availability" aria-label="Go to Availability Section"></a>
  <a href="#map" aria-label="Go to Map Section"></a>
  <a href="#zoning" aria-label="Go to Zoning Section"></a>
  <a href="#development" aria-label="Go to Dev Section"></a>
</div>