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
  let complianceCsvData = new Map();
  let mapcPopCsvData = new Map();
  let activeTab = 'income'; // default tab
  let usePercentage = true; // true = show %; false = show raw counts
  let muniSummaryMap = new Map(); // for scatterplot
  let showBottom = false; // true = show bottom 10; false = show top 10

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
  let muniSelected = false;

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

  const colorScale = d3.scaleOrdinal()
    .domain(Object.keys(demographicColumns)) // or income ranges / family size
    .range(d3.schemeTableau10);

  // Housing timeline
  let selectedYear = 2020; // default year for timeline
  let densityCsvData = new Map();
  let stackedBarData = [];

  // compliance scatterplot
  let compScatterplotData = [];

  async function loadData() {
    // Load CSV and GeoJSON data
    const singleFamilyCsv = await d3.csv(import.meta.env.BASE_URL + 'single_family_zoning/housing_sf_other_w_census.csv');
    // const singleFamilyCsv = await d3.csv('single_family_zoning/housing_sf_other_w_census.csv');
    singleFamilyGeo = await fetch(import.meta.env.BASE_URL + 'single_family_zoning/mapc_region_towns_w_population.geojson').then(res => res.json());
    // singleFamilyGeo = await fetch('single_family_zoning/mapc_region_towns_w_population.geojson').then(res => res.json());
    const unitPriceCsv = await d3.csv(import.meta.env.BASE_URL + 'scatterplot/average_unit_price_by_municipality.csv');
    // const unitPriceCsv = await d3.csv('scatterplot/average_unit_price_by_municipality.csv');
    const complianceCsv = await d3.csv(import.meta.env.BASE_URL + 'single_family_zoning/compliance_muni_census.csv');
    // const complianceCsv = await d3.csv('single_family_zoning/compliance_muni_census.csv');
    const mapcPopCsv = await d3.csv(import.meta.env.BASE_URL + 'housing_timeline/mapc_region_towns_w_population.csv');
    // const mapcPopCsv = await d3.csv('housing_timeline/mapc_region_towns_w_population.csv');
    const densityCsv = await d3.csv(import.meta.env.BASE_URL + 'housing_timeline/housing_units_cumulative_by_type.csv');
    // const densityCsv = await d3.csv('housing_timeline/housing_units_cumulative_by_type.csv');

    // Build CSV map
    singleFamilyCsvData = new Map();
    singleFamilyCsv.forEach(row => {
      singleFamilyCsvData.set(parseInt(row.muni_id), row);
    });
    complianceCsvData = new Map();
    complianceCsv.forEach(row => {
      complianceCsvData.set(parseInt(row.muni_id), row);
    });
    mapcPopCsvData = new Map();
    mapcPopCsv.forEach(row => {
      mapcPopCsvData.set(parseInt(row.town_id), row);
    });
    densityCsv.forEach(row => {
      if (!densityCsvData.has(row.Municipality)) {
        densityCsvData.set(row.Municipality, []);
      }
      densityCsvData.get(row.Municipality).push(row);
    });
    
    // Build unit price map
    const unitPriceMap = new Map();
    unitPriceCsv.forEach(d => {
      if (d.muni && d.average_unit_price) {
        unitPriceMap.set(d.muni.trim().toLowerCase(), parseFloat(d.average_unit_price));
      }
    });

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

    // Compliance data
    compScatterplotData = complianceCsv.map(row => {
      const fid = row.muni_id;
      const town = row.municipal;
      const totalPopulation = parseFloat(row.pop || 0);
      const singleFamilyPercent = parseFloat(singleFamilyCsvData.get(parseInt(fid))?.["%_single_family"] || 0);
      const compliantZoningRate = parseFloat(row["%_compliant_zoning"] || 0);
      const house20 = mapcPopCsvData.get(parseInt(fid))?.housing20 || 0;

      return {
        fid,
        town,
        totalPopulation,
        compliantZoningRate,
        house20,
        singleFamilyPercent,
      };
    });

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

    // const muniSummaryData = await d3.csv('scatterplot/municipality_summary.csv');
    const muniSummaryData = await d3.csv(import.meta.env.BASE_URL + 'scatterplot/municipality_summary.csv');
    muniSummaryMap = new Map();
    muniSummaryData.forEach(d => {
      muniSummaryMap.set(d.muni.trim().toLowerCase(), {
        mean_lot_size_sqft: +d.mean_lot_size_sqft,
        compliance_rate: +d.compliance_rate,
        mean_far: +d.mean_far,
        lot_25: +d["lot_25%"],
        lot_50: +d["lot_50%"],
        lot_75: +d["lot_75%"]
      });
    });
  }

  function onSearch(event) {
    const selected = event.target.value.trim();
    updateSelectedMuni(selected || null, false);
  }


  function updateLotSizeChart(muniName) {
    const svg = d3.select("#lot-size-chart");
    if (svg.empty()) return;

    const data = muniSummaryMap.get(muniName.trim().toLowerCase());
    if (!data) return;

    if (muniName.toLowerCase().trim() === "framingham") {
      svg.selectAll("*").remove();
      svg.append("foreignObject")
        .attr("x", 0)
        .attr("y", 20)
        .attr("width", parseInt(svg.style("width")))
        .attr("height", 100)
        .append("xhtml:div")
        .style("font-size", "15px")
        .style("color", "#5c4a56")
        .style("width", "90%")
        .style("margin", "0 auto")
        .style("text-align", "center")
        .html("Data for Framingham contains inconsistencies. Unfortunately, lot size and zoning compliance information cannot be shown.");
      return;
    }


    const lotSizeData = [
      { label: "25th", value: data.lot_25 },
      { label: "Median", value: data.lot_50 },
      { label: "75th", value: data.lot_75 }
    ];

    svg.selectAll("*").remove();

    const margin = { top: 30, right: 20, bottom: 60, left: 50 };
    const width = parseInt(svg.style("width")) - margin.left - margin.right;
    const height = parseInt(svg.style("height")) - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(lotSizeData.map(d => d.label))
      .range([0, width])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, d3.max(lotSizeData, d => d.value) * 1.1])
      .range([height, 0]);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .style("font-size", "10px");

    g.append("g")
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => `${d / 1000}K`))
      .selectAll("text")
      .style("font-size", "10px");

    // Bars with neutral fill
    g.selectAll("rect")
      .data(lotSizeData)
      .enter()
      .append("rect")
      .attr("x", d => x(d.label))
      .attr("y", d => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.value))
      .attr("fill", "#baa6d0"); // pastel purple

    // Chart title
    svg.append("text")
      .attr("x", parseInt(svg.style("width")) / 2)
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Lot Size Distribution");

    // Y-axis label
    svg.append("text")
      .attr("text-anchor", "middle")
      .attr("transform", `rotate(-90)`)
      .attr("x", -parseInt(svg.style("height")) / 2)
      .attr("y", 14)
      .style("font-size", "10px")
      .text("Lot Size (sqft)");

    // Compliance progress bar below chart
    svg.append("rect")
      .attr("x", margin.left)
      .attr("y", parseInt(svg.style("height")) - 35)
      .attr("width", width)
      .attr("height", 14)
      .attr("fill", "#eee");

    svg.append("rect")
      .attr("x", margin.left)
      .attr("y", parseInt(svg.style("height")) - 35)
      .attr("width", width * data.compliance_rate)
      .attr("height", 14)
      .attr("fill", data.compliance_rate < 0.5 ? "red" : "#baa6d0");

    svg.append("text")
      .attr("x", margin.left + width / 2)
      .attr("y", parseInt(svg.style("height")) - 10)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", "#5c4a56")
      .text(`Zoning Compliance: ${(data.compliance_rate * 100).toFixed(0)}%`);
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

  function initDensityBarChart() {
    const margin = { top: 20, right: 20, bottom: 80, left: 60 };

    const container = d3.select("#density-bar-chart");
    container.selectAll("svg").remove();

    const containerWidth = container.node().clientWidth;
    const containerHeight = container.node().clientHeight;

    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const svg = container.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    svg.append("rect")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .attr("x", -margin.left)
      .attr("y", -margin.top)
      .attr("fill", "white");

    const tooltip = d3.select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "white")
      .style("padding", "6px 10px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "6px")
      .style("pointer-events", "none")
      .style("font-size", "12px")
      .style("opacity", 0);

    window.densityTooltip = tooltip;
    window.densityBarSvg = svg;
    window.densityBarX = d3.scaleBand().range([0, width]).padding(0.2);
    window.densityBarY = d3.scaleLinear().range([height, 0]);
    window.densityColor = d3.scaleOrdinal()
      .domain(["Single-Family", "Multi-Family", "Condo", "Other", "Mobile Home"])
      .range(["#cab2d6", "#fb9a99", "#a6cee3", "#fdbf6f", "#b2df8a"]);

    svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
    svg.append("g").attr("class", "y-axis");

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 60)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", "#5a4e4d")
      .text("Municipality");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -45)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("fill", "#5a4e4d")
      .text("Housing Density (units per 10,000 sq meter)");

    // Additional line chart container
    d3.select("#density-line-chart").selectAll("svg").remove();
  }

  function updateDensityBarChart(selectedYear) {
    stackedBarData = [];
    densityCsvData.forEach((rows, muni) => {
      const yearRow = rows.find(r => r.Year === String(selectedYear));
      if (!yearRow) return;

      const totalUnits =
        +yearRow["Single-Family"] +
        +yearRow["Multi-Family"] +
        +yearRow["Condo"] +
        +yearRow["Other"] +
        +yearRow["Mobile Home"];

      const landAreaEntry = mapcPopCsvData.get(parseInt(yearRow["TOWN_ID"], 10))['aland20'];
      if (!landAreaEntry) return;

      const density = totalUnits / +landAreaEntry;

      stackedBarData.push({
        muni,
        density,
        types: {
          "Single-Family": +yearRow["Single-Family"],
          "Multi-Family": +yearRow["Multi-Family"],
          "Condo": +yearRow["Condo"],
          "Other": +yearRow["Other"],
          "Mobile Home": +yearRow["Mobile Home"],
        },
        year: +yearRow["Year"],
        Area: +landAreaEntry,
      });
    });

    showBottom = document.getElementById("densityRankSwitch")?.checked;
    const categories = ["Single-Family", "Multi-Family", "Condo", "Other", "Mobile Home"];

    const data = stackedBarData.filter(d => d.year === selectedYear);
    const stacked = data.map(d => {
      const entry = { Municipality: d.muni };
      let total = 0;
      categories.forEach(cat => {
        entry[cat] = d.Area > 0 ? (d.types[cat] / d.Area) * 10000 : 0;
        total += entry[cat];
      });
      entry.totalDensity = total;
      return entry;
    });

    const sorted = stacked
      .filter(d => isFinite(d.totalDensity))
      .sort((a, b) => showBottom ? a.totalDensity - b.totalDensity : b.totalDensity - a.totalDensity)
      .slice(0, 10);

    const stackedSeries = d3.stack().keys(categories.slice().reverse())(sorted);

    densityBarX.domain(sorted.map(d => d.Municipality));
    densityBarY.domain([0, d3.max(sorted, d => d.totalDensity) * 1.1]);

    densityBarSvg.select(".x-axis")
      .transition()
      .duration(400)
      .call(d3.axisBottom(densityBarX))
      .selectAll("text")
      .attr("transform", "rotate(-40)")
      .style("text-anchor", "end")
      .style("font-size", "11px");

    densityBarSvg.select(".y-axis")
      .transition()
      .duration(400)
      .call(d3.axisLeft(densityBarY).ticks(6));

    densityBarSvg.selectAll(".bar-group").remove();

    const tooltip = window.densityTooltip;

    const groups = densityBarSvg.selectAll(".bar-group")
      .data(stackedSeries)
      .enter()
      .append("g")
      .attr("class", "bar-group")
      .attr("fill", d => densityColor(d.key));

    groups.selectAll("rect")
      .data(d => d)
      .enter()
      .append("rect")
      .attr("x", d => densityBarX(d.data.Municipality))
      .attr("y", d => densityBarY(d[1]))
      .attr("height", d => Math.max(0, densityBarY(d[0]) - densityBarY(d[1])))
      .attr("width", densityBarX.bandwidth())
      .style("stroke", "#333")
      .style("stroke-width", "0px")
      .on("mouseover", function(event, d) {
        const category = d3.select(this.parentNode).datum().key;
        const value = d.data[category];
        tooltip.transition().duration(100).style("opacity", 0.95);
        tooltip
          .html(
            `<b>${d.data.Municipality}</b><br>` +
            `Category: <b>${category}</b><br>` +
            `Density: ${value.toFixed(1)} units / 10,000 sq meter<br>` +
            `Total: ${d.data.totalDensity.toFixed(1)}`
          )
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");

          d3.select(this).attr("stroke", "#5c5145").attr("stroke-width", 2);
      })
      .on("mouseout", function() {
        d3.select(this).attr("stroke", null);
        tooltip.transition().duration(200).style("opacity", 0);
      })
      .on("click", function(event, d) {
        const clickedMuni = d.data.Municipality;
        const muniRows = densityCsvData.get(clickedMuni);
        if (muniRows) {
          drawLineChart(clickedMuni, muniRows);
        }
      });

  }

  function drawLineChart(muni = "Cambridge") {
    const margin = { top: 35, right: 30, bottom: 40, left: 30 };
    const container = d3.select("#cumulative-line-chart");
    container.selectAll("*").remove();

    const width = container.node().clientWidth - margin.left - margin.right;
    const height = 150;

    const svg = container.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const raw = densityCsvData.get(muni);
    if (!raw) return;

    const townInfo = mapcPopCsvData.get(+raw[0]["TOWN_ID"]);
    if (!townInfo || !townInfo.aland20) return;

    // Get land area
    const area = mapcPopCsvData.get(+raw[0]["TOWN_ID"])?.aland20;
    if (!area) return;

    const popFields = {
      1985: "pop1980",
      1990: "pop1990",
      2000: "pop2000",
      2010: "pop2010",
      2020: "pop2020",
      2025: "pop2020", // use latest pop for 2025
    };

    // Compute rate of change (unit increase from prior year / area)
    const years = raw.map(d => +d.Year).sort((a, b) => a - b);
    const chartData = [];
    const popData = [];

    for (const year of years) {
      const yearData = raw.find(d => +d.Year === year);
      if (!yearData) continue;

      const totalUnits = +yearData["Single-Family"] + +yearData["Multi-Family"] + +yearData["Condo"] + +yearData["Other"] + +yearData["Mobile Home"];
      const rate = (totalUnits / area) * 10000; // units per 10,000 sq meter

      const popField = popFields[year];
      const population = townInfo[popField];

      chartData.push({
        year,
        rate,
      });

      const pop = population ? (population / area) * 10000 : 0; // units per 10,000 sq meter
      if (pop > 0) {
        popData.push({
          year,
          pop,
        });
      }
    }

    const x = d3.scaleLinear()
      .domain(d3.extent(chartData, d => d.year))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([d3.min(chartData, d => d.rate), d3.max(chartData, d => d.rate)])
      // .domain([0, d3.max(chartData, d => d.rate) * 1.1])
      .range([height, 0]);
    
    const yPop = d3.scaleLinear()
      .domain([d3.min(popData, d => d.pop), d3.max(popData, d => d.pop)])
      // .domain([0, d3.max(popData, d => d.pop) * 1.1])
      .range([height, 0]);

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.rate))
      .curve(d3.curveMonotoneX);

    const linePop = d3.line()
      .x(d => x(d.year))
      .y(d => yPop(d.pop))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", "#9b6e63")
      .attr("stroke-width", 3)
      .attr("d", line);
    
    svg.append("path")
      .datum(popData)
      .attr("fill", "none")
      .attr("stroke", "#5c4a61")
      .attr("stroke-width", 2)
      .attr("d", linePop);

    // Axes
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    svg.append("g")
      .call(d3.axisLeft(y));
    
    svg.append("g")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yPop));


    // Axis labels
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 40)
      .attr("text-anchor", "middle")
      .style("font-size", "13px")
      .style("fill", "#5a4e4d")
      .text("Year");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -30)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "13px")
      .style("fill", "#5a4e4d")
      .text("New Units Built per 10,000 sq meter");
    
    svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", width + 30)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .style("fill", "#5c4a61")
    .text("Population per 10,000 sq meter");


    // Title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("fill", "#5c4a61")
      .style("font-weight", 600)
      .text(`${muni} | Housing Growth Rate Over Time`);
    
    // Legend container
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 270}, ${10})`);

  // Housing growth legend
  legend.append("line")
    .attr("x1", 0)
    .attr("x2", 20)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "#9b6e63")
    .attr("stroke-width", 3);

  legend.append("text")
    .attr("x", 30)
    .attr("y", 5)
    .style("font-size", "12px")
    .style("fill", "#5a4e4d")
    .text("Cumulative Units");

  // Population legend
  legend.append("line")
    .attr("x1", 0)
    .attr("x2", 20)
    .attr("y1", 20)
    .attr("y2", 20)
    .attr("stroke", "#5c4a61")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 2");

  legend.append("text")
    .attr("x", 30)
    .attr("y", 25)
    .style("font-size", "12px")
    .style("fill", "#5a4e4d")
    .text("Population");
  }


function initCumulativeLineChart() {
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const container = d3.select("#cumulative-line-chart");
  container.selectAll("svg").remove();

  const width = container.node().clientWidth - margin.left - margin.right;
  const height = container.node().clientHeight - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  window.lineChartSvg = svg;
  window.lineChartWidth = width;
  window.lineChartHeight = height;
  window.lineChartX = d3.scaleLinear().range([0, width]);
  window.lineChartY = d3.scaleLinear().range([height, 0]);

  svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  svg.append("g").attr("class", "y-axis");

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height + 30)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#5a4e4d")
    .text("Year");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -40)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#5a4e4d")
    .text("Cumulative Units Built");
}


  function initComplianceScatterplot() {
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const width = 400 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const filteredData = compScatterplotData.filter(d => d.singleFamilyPercent > 0.15);

    const container = d3.select("#compliance-scatterplot");
    container.selectAll("svg").remove();

    const svg = container.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xMin = d3.min(filteredData, d => d.singleFamilyPercent) - 5;
    const xMax = d3.max(filteredData, d => d.singleFamilyPercent) + 5;
    const yMin = d3.min(filteredData, d => d.compliantZoningRate / 100) - 0.05;
    const yMax = d3.max(filteredData, d => d.compliantZoningRate / 100) + 0.05;

    const x = d3.scaleLinear().domain([Math.max(0, xMin), Math.min(100, xMax)]).range([0, width]);
    const y = d3.scaleLinear().domain([Math.max(0, yMin), Math.min(1, yMax)]).range([height, 0]);
    const r = d3.scaleSqrt()
      .domain([0, d3.max(filteredData, d => d.totalPopulation)])
      .range([2, 12]);
    const color = d3.scaleOrdinal()
      .domain(["Urban Core", "Suburb", "Rural"])
      .range(["#fdbb84", "#fc4e2a", "#9932cc"]);

    const tooltip = container.append("div")
      .style("position", "absolute")
      .style("background", "white")
      .style("padding", "6px 10px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "6px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d => `${d.toFixed(0)}%`));

    svg.append("g")
      .call(d3.axisLeft(y).tickFormat(d3.format(".0%")));

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 40)
      .attr("text-anchor", "middle")
      .text("% Single-Family Units");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .text("Zoning Compliance Rate");

    svg.selectAll("circle")
      .data(filteredData)
      .enter()
      .append("circle")
      .attr("cx", d => x(d.singleFamilyPercent))
      .attr("cy", d => y(d.compliantZoningRate / 100))
      .attr("r", d => r(d.totalPopulation))
      .attr("fill", d => color(d.region))
      .attr("opacity", 0.75)
      .attr("stroke", "#333")
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 0.9);
        tooltip.html(`
          <strong>${d.town || "Unknown"}</strong><br/>
          % Single-Family: ${d.singleFamilyPercent.toFixed(1)}%<br/>
          % Compliant Zoning: ${d.compliantZoningRate.toFixed(1)}%<br/>
          Population: ${d.totalPopulation.toLocaleString()}
        `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => {
        tooltip.transition().duration(300).style("opacity", 0);
      });

    // === Linear regression (least squares) ===
    const xVals = filteredData.map(d => d.singleFamilyPercent);
    const yVals = filteredData.map(d => d.compliantZoningRate / 100);
    const n = xVals.length;
    const xMean = d3.mean(xVals);
    const yMean = d3.mean(yVals);
    const slope = d3.sum(xVals.map((x, i) => (x - xMean) * (yVals[i] - yMean))) /
                  d3.sum(xVals.map(x => (x - xMean) ** 2));
    const intercept = yMean - slope * xMean;

    // Endpoints of the regression line
    const xStart = d3.min(xVals);
    const xEnd = d3.max(xVals);
    const yStart = slope * xStart + intercept;
    const yEnd = slope * xEnd + intercept;

    // Draw the trendline
    svg.append("line")
      .attr("x1", x(xStart))
      .attr("y1", y(yStart))
      .attr("x2", x(xEnd))
      .attr("y2", y(yEnd))
      .attr("stroke", "black")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,4")
      .lower(); // Put behind dots
  }

  function initComplianceBoxPlot() {
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = 500 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    // Bins
    const bins = [
      { range: [0, 25], label: "0–25%" },
      { range: [25, 50], label: "25–50%" },
      { range: [50, 75], label: "50–75%" },
      { range: [75, 100], label: "75–100%" },
    ];

    // Prepare SVG
    const container = d3.select("#compliance-boxplot");
    container.selectAll("svg").remove();

    const svg = container.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Tooltip
    const tooltip = container.append("div")
      .style("position", "absolute")
      .style("background", "white")
      .style("padding", "6px 10px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "6px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    // Bin and preprocess
    const binned = bins.map(bin => {
      const members = compScatterplotData.filter(d =>
        d.singleFamilyPercent >= bin.range[0] &&
        d.singleFamilyPercent < bin.range[1]
      );
      members.sort((a, b) => a.compliantZoningRate - b.compliantZoningRate);
      const values = members.map(d => d.compliantZoningRate / 100);
      const q1 = d3.quantile(values, 0.25);
      const q2 = d3.quantile(values, 0.5);
      const q3 = d3.quantile(values, 0.75);
      const iqr = q3 - q1;
      const min = d3.min(values);
      const max = d3.max(values);
      const regionMode = d3.rollup(members, v => v.length, d => d.region);
      const dominantRegion = [...regionMode.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
      return {
        ...bin,
        values, members, q1, q2, q3, iqr, min, max, region: dominantRegion
      };
    });

    const x = d3.scaleBand()
      .domain(binned.map(d => d.label))
      .range([0, width])
      .paddingInner(0.4)
      .paddingOuter(0.2);

    const y = d3.scaleLinear()
      .domain([0.8, 1.0])
      .range([height, 0]);

    // Axes
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x));

    svg.append("g")
      .call(d3.axisLeft(y).tickFormat(d3.format(".0%")));

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 40)
      .attr("text-anchor", "middle")
      .text("% Single-Family Housing (Binned)");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .text("Zoning Compliance Rate");

    // Boxes
    svg.selectAll(".box")
      .data(binned)
      .enter()
      .append("rect")
      .attr("class", "box")
      .attr("x", d => x(d.label))
      .attr("y", d => y(d.q3))
      .attr("width", x.bandwidth())
      .attr("height", d => y(d.q1) - y(d.q3))
      .attr("fill", "#a6bddb")
      .attr("stroke", "black")
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 0.9);
        tooltip.html(`
          <strong>${d.label}</strong><br/>
          Count: ${d.values.length}<br/>
          Q1: ${(d.q1 * 100).toFixed(1)}%<br/>
          Median: ${(d.q2 * 100).toFixed(1)}%<br/>
          Q3: ${(d.q3 * 100).toFixed(1)}%
        `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", () => {
        tooltip.transition().duration(300).style("opacity", 0);
      });

    // Medians
    svg.selectAll(".median-line")
      .data(binned)
      .enter()
      .append("line")
      .attr("class", "median-line")
      .attr("x1", d => x(d.label))
      .attr("x2", d => x(d.label) + x.bandwidth())
      .attr("y1", d => y(d.q2))
      .attr("y2", d => y(d.q2))
      .attr("stroke", "black")
      .attr("stroke-width", 2);

    // Jittered individual points
    const jitter = 0.2 * x.bandwidth();

    svg.selectAll(".point")
      .data(binned.flatMap(d => d.members.map(m => ({ ...m, bin: d.label }))))
      .enter()
      .append("circle")
      .attr("cx", d => x(d.bin) + x.bandwidth() / 2 + (Math.random() - 0.5) * jitter)
      .attr("cy", d => y(d.compliantZoningRate / 100))
      .attr("r", 3)
      .attr("fill", "#3690c0")
      .attr("opacity", 0.6)
      .attr("stroke", "#333")
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 0.9);
        tooltip.html(`
          <strong>${d.town || "Unknown"}</strong><br/>
          % Single-Family: ${d.singleFamilyPercent.toFixed(1)}%<br/>
          % Compliant Zoning: ${d.compliantZoningRate.toFixed(1)}%<br/>
          Population: ${d.totalPopulation.toLocaleString()}<br/>
        `)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", () => {
        tooltip.transition().duration(300).style("opacity", 0);
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
    updateDensityBarChart(selectedYear);
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
      .call(d3.axisBottom(x).tickFormat(d3.format("$.2s")))
      .selectAll("text")
      .style("font-size", "12px");

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 50)
      .attr("text-anchor", "middle")
      .text("Average Household Yearly Income ($)")
      .style("font-size", "14px");

    // Y Axis
    svg.append("g")
      .call(d3.axisLeft(y).tickFormat(d => d >= 1000000 ? `$${d/1000000}M` : d3.format("$.2s")(d)))
      .selectAll("text")
      .style("font-size", "12px");

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
      muniSelected = false;

      // Reset all circles appearance
      const circles = d3.select("#scatterplot svg g").selectAll("circle");
      circles
        .attr("r", 6)
        .attr("stroke-width", 0.1)
        .attr("opacity", 0.85);

      // Hide tooltip
      tooltip.transition().duration(300).style("opacity", 0);

      // Clear left box
      const infoBox = document.getElementById("municipality-info");
      if (infoBox) {
        infoBox.innerHTML = `<em>No municipality selected.</em>`;
      }


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
      .attr("r", 6) // 🌟 Bigger dots
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
        <b>Years to Pay Off*:</b> ${d.yearsToPayoff.toFixed(1)}
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

    // Click to select a municipality
    svg.selectAll("circle")
    .on("click", (event, d) => {
      updateSelectedMuni(d.muni, true);

      // Sync dropdown
      const selectElement = document.getElementById("searchSelect");
      if (selectElement) {
        selectElement.value = d.muni;
      }
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
      .attr("transform", `translate(${width - 300}, 50)`); // move to top right corner nicely

    // Draw a red dashed sample line inside
    lineLegend.append("line")
      .attr("x1", 0)
      .attr("y1", 14)
      .attr("x2", 40)
      .attr("y2", 14)
      .attr("stroke", "red")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5");

    // Text next to it
    lineLegend.append("text")
      .attr("x", 50)
      .attr("y", 15)
      .text("Units purchasable with 10 years income*")
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
      .text("Years to Pay Off*");
  }

  function updateSelectedMuni(muniName, showTooltip = false) {
    selectedMuni = muniName;
    muniSelected = true;

    const circles = d3.select("#scatterplot svg g").selectAll("circle");
    circles
      .attr("r", d => (d.muni === selectedMuni ? 10 : 6))
      .attr("stroke-width", d => (d.muni === selectedMuni ? 1.5 : 0.1))
      .attr("opacity", d => (d.muni === selectedMuni ? 1 : 0.85));

    const match = scatterData.find(d => d.muni === selectedMuni);
    if (!match) return;

    const infoBox = document.getElementById("municipality-info");
    if (infoBox) {
      let explanation = "";

      if (match.muni === "Cambridge") {
        explanation = `
          <p style="margin-top: 0.75rem; font-size: 0.85rem; line-height: 1.4;">
            <strong>Cambridge is a major outlier.</strong><br>
            Despite high household incomes, home prices are so elevated that it would take <strong>over 127 years</strong> to pay off a typical unit.
            This extreme mismatch reflects <em>high demand, restricted housing supply,</em> and <em>zoning limits</em>, raising serious barriers to affordability in this high-opportunity city.
          </p>`;
      } else if (match.muni === "Boston") {
        explanation = `
          <p style="margin-top: 0.75rem; font-size: 0.85rem; line-height: 1.4;">
            <strong>Boston is a major outlier.</strong><br>
            With a <strong>68-year payoff time</strong>, the city’s housing costs dramatically outpace what most residents earn.
            Boston’s case highlights how <em>urban demand, uneven income distribution,</em> and <em>tight zoning policies</em> distort affordability even in cities with strong job markets.
          </p>`;
      }

      infoBox.innerHTML = `
        <strong>${match.muni}</strong><br/>
        <b>Avg Income:</b> ${formatMillions(match.avgIncome)}<br/>
        <b>Avg Unit Price:</b> ${formatMillions(match.avgUnitPrice)}<br/>
        <b>Years to Pay Off*:</b> ${match.yearsToPayoff.toFixed(1)}<br/>
        ${explanation}
        <br/>
        <svg id="lot-size-chart" width="350" height="250"></svg>
      `;
    }

    updateLotSizeChart(selectedMuni);

    if (showTooltip) {
      const svgElement = document.querySelector("#scatterplot svg");
      const pt = svgElement.createSVGPoint();
      pt.x = x(match.avgIncome);
      pt.y = y(match.avgUnitPrice);
      const screenPoint = pt.matrixTransform(svgElement.getScreenCTM());
      const scatterRect = svgElement.getBoundingClientRect();

      tooltip
        .style("left", (screenPoint.x - scatterRect.left + 80) + "px")
        .style("top", (screenPoint.y - scatterRect.top + 30) + "px")
        .style("opacity", 0.9);
    } else {
      tooltip.transition().duration(300).style("opacity", 0); // hide it if not hovering
    }

    circles.filter(d => d.muni === selectedMuni).raise();

    const graphBox = document.getElementById("municipality-graphs");
    if (graphBox) graphBox.style.display = "block";
  }

  onMount(async () => {
    await loadData();
    await initScatterplot();
    await initZoningMap();
    // await initComplianceScatterplot();
    await initComplianceBoxPlot();
    await initDensityBarChart();
    await updateDensityBarChart(selectedYear);
    await initCumulativeLineChart();
    await drawLineChart('Cambridge');

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
      color: #7c6757;
      line-height: 1.2;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.05);
      animation: fadeInUp 0.8s ease-out;
    ">
      <!-- Reforming Zoning for<br> <span style="color: #d4a593;">Affordable Housing</span> -->
      Zoning, Housing, and the Unequal Map of Opportunity
    </h1>

    <p style="
      font-size: 1.4rem;
      color: #7c6757;
      max-width: 700px;
      margin: 0 auto 40px;
      line-height: 1.6;
      animation: fadeInUp 0.8s ease-out 0.2s both;
    ">
      Explore how generations of families have faced housing barriers — and how today’s zoning laws still shape who gets to live where.
    </p >

    <a href="#housing_struggle" style="
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

<!-- Page 1: Ancestral Housing Struggle -->
<section id= "housing_struggle" style="max-width: 900px; margin: 3rem auto; padding: 0 20px;">
  <div style="
      background: #f9f4ef;
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  ">
    <!-- Comic image -->
    <img
      src="{import.meta.env.BASE_URL}images/comic-ancestors.png"
      alt="Ancestors Searching for Housing"
      style="width: 100%; border-radius: 8px; margin-bottom: 1.5rem;"
    />

    <!-- Header -->
    <div class="section-header" style="font-size: 2.5rem;">
      Ancestral Housing Struggle
    </div>

    <!-- Guide text -->
    <p style="font-size: 1.2rem; line-height: 1.6; color: #7c6757; text-align: center; margin-bottom: 1.8rem;">
      From the 1950s onward, families across generations have faced the same challenge: finding a home they can afford.  
      Grandparents combed neighborhoods for “FOR RENT” signs, only to find prices rising beyond their means.
    </p>

    <!-- Take-aways -->
    <ul style="list-style: disc inside; font-size: 1.1rem; line-height: 1.6; color: #7c6757; max-width: 700px; margin: 0 auto;">
      <li>Housing costs have outpaced wage growth since the post-war era.</li>
      <li>Single-family zoning and lack of multi-unit options squeezed supply.</li>
      <li>Today’s young adults still inherit a legacy of limited, expensive choices.</li>
    </ul>
  </div>
</section>

<!-- Timeline Section -->
<section id="housing_timeline" style="max-width: 900px; margin: 3rem auto; padding: 0 20px;">
  <div class="section-header" style="font-size: 2.5rem;">
    Housing Struggles Across Decades
  </div>

  <div style="position: relative; padding: 2rem 0;">
    <!-- Vertical timeline line -->
    <div style="
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 100%;
      background: #ddd;
    "></div>

    <!-- Timeline Entry: 1950s -->
    <div style="
      position: relative;
      width: 50%;
      padding: 1rem 2rem 1rem 0;
      box-sizing: border-box;
      text-align: right;
    ">
      <div style="
        position: absolute;
        right: -9px;
        top: 1.5rem;
        width: 18px;
        height: 18px;
        background: #f9f4ef;
        border: 3px solid #5c5145;
        border-radius: 50%;
      "></div>

      <div class="timeline-card" style="
        display: inline-block;
        background: white;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <h3 style="margin: 0 0 0.5rem; font-size: 1.4rem; color: #5c5145;">1950s:</h3>
        <h3 style="margin: 0 0 0.5rem; font-size: 1.2rem; color: #5c5145;">Suburban Single-Family Zoning</h3>
        <img src="{import.meta.env.BASE_URL}images/comic-1950s.png" alt="1950s housing"
             style="width: 200px; border-radius: 6px; margin-bottom: 0.5rem;" />
        <p style="margin: 0; font-size: 1rem; color: #7c6757; line-height: 1.4;">
          In the post-war boom, Boston and its suburbs adopted large-lot, single-family zoning districts. Grandparents scoured rental ads—only to find costs climbing beyond reach.
        </p>
      </div>
    </div>

    <!-- Timeline Entry: 1980s -->
    <div style="
      position: relative;
      width: 50%;
      left: 50%;
      padding: 1rem 0 1rem 2rem;
      box-sizing: border-box;
      text-align: left;
    ">
      <div style="
        position: absolute;
        left: -9px;
        top: 1.5rem;
        width: 18px;
        height: 18px;
        background: #f9f4ef;
        border: 3px solid #5c5145;
        border-radius: 50%;
      "></div>

      <div class="timeline-card" style="
        display: inline-block;
        background: white;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <h3 style="margin: 0 0 0.5rem; font-size: 1.4rem; color: #5c5145;">1980s:</h3>
        <h3 style="margin: 0 0 0.5rem; font-size: 1.2rem; color: #5c5145;">Redlining and Discretionary Controls</h3>
        <img src="{import.meta.env.BASE_URL}images/comic-1980s.png" alt="1980s housing"
             style="width: 200px; border-radius: 6px; margin-bottom: 0.5rem;" />
        <p style="margin: 0; font-size: 1rem; color: #7c6757; line-height: 1.4;">
          Their children faced the same “FOR RENT” frustration in growing cities. Although formal redlining maps date earlier, the 1980s saw their legacy solidify in zoning practice: neighborhoods graded “hazardous” (often communities of color) remained problematic.
        </p>
      </div>
    </div>

    <!-- Timeline Entry: 2000s -->
    <div style="
      position: relative;
      width: 50%;
      padding: 1rem 2rem 1rem 0;
      box-sizing: border-box;
      text-align: right;
    ">
      <div style="
        position: absolute;
        right: -9px;
        top: 1.5rem;
        width: 18px;
        height: 18px;
        background: #f9f4ef;
        border: 3px solid #5c5145;
        border-radius: 50%;
      "></div>

      <div class="timeline-card" style="
        display: inline-block;
        background: white;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <h3 style="margin: 0 0 0.5rem; font-size: 1.4rem; color: #5c5145;">2000s:</h3>
        <h3 style="margin: 0 0 0.5rem; font-size: 1.2rem; color: #5c5145;">Inclusionary Development Policy (IDP)</h3>
        <img src="{import.meta.env.BASE_URL}images/comic-2000s.png" alt="2000s housing"
             style="width: 200px; border-radius: 6px; margin-bottom: 0.5rem;" />
        <p style="margin: 0; font-size: 1rem; color: #7c6757; line-height: 1.4;">
          In 2000, Mayor Menino issued an executive order creating Boston’s first Inclusionary Development Policy. Any new project of ten-plus units needing zoning relief or City financing must include a share of permanently income-restricted homes.
        </p>
      </div>
    </div>

    <!-- Timeline Entry: 2020s -->
    <div style="
      position: relative;
      width: 50%;
      left: 50%;
      padding: 1rem 0 1rem 2rem;
      box-sizing: border-box;
      text-align: left;
    ">
      <div style="
        position: absolute;
        left: -9px;
        top: 1.5rem;
        width: 18px;
        height: 18px;
        background: #f9f4ef;
        border: 3px solid #5c5145;
        border-radius: 50%;
      "></div>

      <div class="timeline-card" style="
        display: inline-block;
        background: white;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <h3 style="margin: 0 0 0.5rem; font-size: 1.4rem; color: #5c5145;">2020s:</h3>
        <h3 style="margin: 0 0 0.5rem; font-size: 1.2rem; color: #5c5145;">MBTA Communities Act & Ongoing Reforms</h3>
        <img src="{import.meta.env.BASE_URL}images/comic-2020s.png" alt="2020s housing"
             style="width: 200px; border-radius: 6px; margin-bottom: 0.5rem;" />
        <p style="margin: 0; font-size: 1rem; color: #7c6757; line-height: 1.4;">
          In 2021, the state enacted the MBTA Communities Act, requiring the 177 municipalities served by MBTA transit (Boston itself is exempt) to zone for walkable, moderate-density multifamily housing near stations. Concurrently, Boston updated its IZ rules in late 2024, raising set-aside requirements to further boost affordability. However, today’s renters see “RENT TOO HIGH” on every listing—proof the cycle continues.
        </p>
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
        <div style="flex: 1; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="text-align: center;">
            <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">💬 <br><br>Affordability Explorer</h4>
            <p style="font-size: 1.1rem;">Compare average household incomes to home purchase prices across municipalities.</p>
            <ul style="text-align: left; margin-top: 1rem; padding-left: 1.5rem; font-size: 1.0rem; line-height: 1.6;">
              <li>Identify affordable and unaffordable regions</li>
              <li>Hover to view detailed municipality-level data</li>
              <li>Highlight specific towns via search</li>
            </ul>
          </div>
          <a href="#price" style="align-self: center; margin-top: 2rem; padding: 10px 20px; background: #F8D6C5; color: #5c5145; border-radius: 6px; font-weight: 600; text-decoration: none;">Explore</a>
        </div>
      
        <!-- Tool 2: Timeline -->
        <div style="flex: 1; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="text-align: center;">
            <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">📅 <br><br>Housing Growth Timeline</h4>
            <p style="font-size: 1.1rem;">Track the expansion of new housing units across Greater Boston municipalities from 1985 to 2025.</p>
            <ul style="text-align: left; margin-top: 1rem; padding-left: 1.5rem; font-size: 1.0rem; line-height: 1.6;">
              <li>Adjust the year slider to see cumulative housing built up to a selected year</li>
              <li>Compare towns to spot where growth has accelerated — or slowed</li>
            </ul>
          </div>
          <a href="#timeline" style="align-self: center; margin-top: 2rem; padding: 10px 20px; background: #F8D6C5; color: #5c5145; border-radius: 6px; font-weight: 600; text-decoration: none;">Explore</a>
        </div>
      
        <!-- Tool 3: Interactive Map -->
        <div style="flex: 1; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="text-align: center;">
            <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">🗺️ <br><br>Housing Access Explorer</h4>
            <p style="font-size: 1.1rem;">Filter and map neighborhoods based on household income, demographics, or family size.</p>
            <ul style="text-align: left; margin-top: 1rem; padding-left: 1.5rem; font-size: 1.0rem; line-height: 1.6;">
              <li>Switch between income, demographic, and family size</li>
              <li>Toggle between density or absolute numbers</li>
              <li>Compare access and opportunity across regions</li>
            </ul>
          </div>
          <a href="#map" style="align-self: center; margin-top: 2rem; padding: 10px 20px; background: #F8D6C5; color: #5c5145; border-radius: 6px; font-weight: 600; text-decoration: none;">Explore</a>
        </div>
      </div>      

      <div style="margin-top: 3rem; background: #F8D6C5; padding: 1.5rem; border-radius: 8px;">
        <h4 style="font-size: 1.4rem; margin-top: 0; color: #5c5145;">Why It Matters:</h4>
        <ul style="font-size: 1.1rem; margin-bottom: 0; line-height: 1.6;">
          <li>Zoning laws decide what gets built—and who gets to live where. In Greater Boston, these rules have long shaped access to opportunity, limiting housing choices for moderate-income families.</li>
          <li>Our tools make the impact of zoning visible: where housing supply has stalled, where exclusion persists, and where reform can open doors. If we want a fairer housing future, we need to rethink the rules.</li>
        </ul>        
      </div>
    </div>
  </section>

  <section id="price" class="alt-bg">
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; min-height: 100vh;">
      <!-- LEFT: Text Content -->
      <div style="flex: 1; min-width: 300px; background-color: rgba(255, 255, 255, 0.9); padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div class="section-header">Affordability Explorer</div>
        <!-- Top Box: Key Takeaway -->
        <p style="margin-top: 1rem; font-size: 0.95rem; line-height: 1.5;">
          
          To understand how <span style="color: #7c6757; font-weight: 600;">housing affordability varies across Greater Boston</span>, we need to compare <span style="color: #7c6757; font-weight: 600;">what households earn</span> to <span style="color: #7c6757; font-weight: 600;">what homes cost</span>. This scatterplot maps each municipality by its <span style="color: #7c6757; font-weight: 600;">average household income</span> and <span style="color: #7c6757; font-weight: 600;">average home purchase price</span>, helping first-time buyers quickly spot areas where <span style="color: #7c6757; font-weight: 600;">prices align with income—or don’t</span>.<br><br>
          {#if !muniSelected}
          The <span style="color: #7c6757; font-weight: 600;">red dashed line</span> shows the threshold for buying a home with <span style="color: #7c6757; font-weight: 600;">10 years of income*</span>. <span style="color: #7c6757; font-weight: 600;">Points below the line</span> represent places where homes may be more affordable relative to earnings, while <span style="color: #7c6757; font-weight: 600;">points above</span> indicate towns where home prices significantly outpace what residents typically make.<br><br>
        
          <span style="color: #7c6757; font-weight: 600;">Hover over each dot</span> to see municipality details, or <span style="color: #7c6757; font-weight: 600;">use the dropdown</span> to explore specific towns. <span style="color: #7c6757; font-weight: 600;">Boston and Cambridge stand out as outliers</span>—click on them to learn why their numbers defy regional trends and what that means for affordability access in high-demand cities.
          {/if}
        </p>        

        <!-- Bottom Box: Municipality Info -->
        <div style="flex: 1; border: 1px solid #ccc; border-radius: 8px; padding: 1rem; background: #fff; overflow-y: auto;">
          <h4>Selected Municipality</h4>
          <div id="municipality-info">
            <div id="municipality-stats">
              <em>No municipality selected.</em>
            </div>
          
            <!-- Graphs go here -->
            <div id="municipality-graphs" style="margin-top: 1rem; display: none;">
              <div style="display: flex; flex-direction: column; gap: 1.5rem; align-items: center;">
                <div style="min-width: 150px; width: 100%; max-width: 300px;">
                  <h6 style="text-align: center;">Lot Size (sqft)</h6>
                  <svg id="lot-size-chart" width="100%" height="120"></svg>
                </div>
              </div>
            </div>
          </div>

        </div>
            </div>

      <!-- RIGHT: Scatterplot -->
      <div style="flex: 2; min-width: 500px; padding: 2rem 6rem 2rem 2rem;">
        <div style="background-color: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <div style="margin-bottom: 20px; text-align: center;">
            <select id="searchSelect" class="form-select" style="width: 300px;" on:change={onSearch}>
              <option value="">Select Municipality...</option>
              {#each [...scatterData].sort((a, b) => a.muni.localeCompare(b.muni)) as d}
                <option value={d.muni}>{d.muni}</option>
              {/each}
            </select>                 
          </div>

          <div style="padding: 1rem;">
            <div id="scatterplot" style="position: relative; width: 100%; height: 550px;"></div>
          </div>

          <div style="font-size: 0.75rem; color: #5c4a56; margin-top: 1rem; text-align: left;">
            * We assume a 9% down payment for first-time home buyers (<a href="https://www.nerdwallet.com/article/mortgages/average-down-payment-on-a-house" target="_blank" style="color: #555; text-decoration: underline;">source</a>) and 28% of salary allocated to mortgage payments (<a href="https://www.chase.com/personal/mortgage/education/financing-a-home/what-percentage-income-towards-mortgage" target="_blank" style="color: #555; text-decoration: underline;">source</a>).
          </div>
        </div>
      </div>

  </section>        

  <section id="timeline" class="alt-bg">
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; min-height: 100vh;">
    
      <!-- LEFT: Text Content -->
      <div style="flex: 1; min-width: 300px; background-color: rgba(255, 255, 255, 0.9); padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="section-header">Emergency of Housing Over Time</div>
          
          <p style="margin-top: 1rem; font-size: 0.95rem; line-height: 1.5;">
            To understand the <span style="color: #7c6757; font-weight: 600;">urgency of zoning reform</span>, we must look beyond where housing already exists — and instead focus on <span style="color: #7c6757; font-weight: 600;">where new housing is actually being built</span>. This visualization reveals how many housing units were added across Greater Boston from 1985 to 2025, <span style="color: #7c6757; font-weight: 600;">normalized by land area</span> to highlight relative development intensity.<br><br>
          
            Over four decades, housing growth has been <span style="color: #7c6757; font-weight: 600;">extremely limited</span> across most municipalities. In <span style="color: #7c6757; font-weight: 600;">Cambridge</span>—the region’s densest city—just <span style="color: #7c6757; font-weight: 600;">12 units per 10,000 square meters</span> were added, with only <span style="color: #7c6757; font-weight: 600;">2.4 single-family homes</span>—under <span style="color: #7c6757; font-weight: 600;">7%</span> of the total.<br><br>

            This highlights a <span style="color: #7c6757; font-weight: 600;">disconnect between zoning and actual housing growth</span>. <span style="color: #7c6757; font-weight: 600;">Single-family zoning still dominates</span>, yet it no longer reflects how or where homes are built. <span style="color: #7c6757; font-weight: 600;">Restrictive zoning has stalled supply</span>—and <span style="color: #7c6757; font-weight: 600;">without reform</span>, these patterns will <span style="color: #7c6757; font-weight: 600;">keep limiting access and affordability</span>.
          </p >

          <div id="cumulative-line-chart" style="margin-top: 2rem;"></div>          
        </div>
      </div>      
  
      <!-- RIGHT: Bar Chart + Top-Centered Slider -->
      <div style="flex: 2; min-width: 500px; padding: 3rem 6rem 2rem 2rem; display: flex; flex-direction: column; align-items: center;">
        <!-- Year Slider -->
        <div class="d-flex flex-column align-items-center mb-4" style="width: 100%; max-width: 600px;">
          <label for="density-year-slider" class="form-label fw-bold mb-2" style="font-size: 1rem;">Year Selected: <span id="density-year-label">{selectedYear}</span></label>
          <div class="slider-wrapper" style="width: 100%;">
            <div class="slider-track">
              <div class="slider-segment" style="left: 25%;"></div>
              <div class="slider-segment" style="left: 50%;"></div>
              <div class="slider-segment" style="left: 75%;"></div>
            </div>            
            <input
              id="density-year-slider"
              type="range"
              min="1985"
              max="2025"
              step="1"
              value={selectedYear}
              class="form-range custom-slider"
              on:input={onTimelineChange}
            />
            <div class="slider-labels d-flex justify-content-between" style="font-size: 0.85rem; margin-top: 0.25rem;">
              <span>1985</span><span>1995</span><span>2005</span><span>2015</span><span>2025</span>
            </div>
          </div>
        </div>

        <!-- Bar Chart -->
        <div style="width: 100%; max-width: 1200px;">
          <div class="box" style="height: 600px; width: 100%; background-color: #e9e3d9; overflow: hidden;">
            <div id="density-bar-chart" style="position: relative; height: 100%; width: 100%; overflow: visible;">
              <!-- Top/Bottom Density toggle in top-right corner of plot -->
              <div style="position: absolute; top: 16px; right: 16px; z-index: 10;">
                <div class="density-toggle-switch">
                  <input 
                    type="checkbox" 
                    id="densityRankSwitch" 
                    class="toggle-input" 
                    bind:checked={showBottom}
                    on:change={() => { updateDensityBarChart(selectedYear); }}
                  />
                  <label class="toggle-label" style="font-size: 0.9rem; width: 160px" for="densityRankSwitch">
                    <span class="toggle-text">{showBottom ? 'Bottom 10 Densed' : 'Top 10 Densed'}</span>
                    <span class="toggle-thumb" style="width: 27px; height: 27px; border-radius: 50%; right: 2px; transform: {showBottom ? 'translateX(130px)' : 'translateX(0)'};"></span>
                  </label>
                </div>
              </div> 
            </div>
            <p style="font-size: 0.95rem; color: #8a5d51; font-style: italic; margin-bottom: 0.5rem;">
              Click a municipality in the bar chart to explore how many homes were built over time.
            </p>    
          </div>
        </div>
      </div>
    </div>
  </section>    

  <section id="map" class="alt-bg">
    <div style="display: flex; flex-wrap: wrap; gap: 2rem; align-items: stretch; min-height: 100vh;">
      <!-- LEFT: Text Content -->
      <div style="flex: 1; min-width: 300px; background-color: rgba(255, 255, 255, 0.9); padding: 2rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="section-header">Housing Access Across Communities</div>
          
          <p style="margin-top: 1rem; font-size: 0.95rem; line-height: 1.5;">
            To understand <strong>how zoning reforms affect affordable housing in Greater Boston</strong>, we need to examine not just <strong>what types of housing are allowed</strong>, but also <strong>who lives where—and why</strong>. 
            The map on the right shows the <strong>demographic and income distribution</strong> of residents, helping renters and buyers earning <strong>60–100% of the Area Median Income (AMI)</strong> see which communities are accessible to them.
            By toggling filters, we can uncover patterns in <strong>where different racial, income, and family groups tend to live</strong>—and more importantly, where they are excluded. <br><br>

            On the left, the boxplot links this to policy by showing how <strong>single-family zoning patterns</strong> relate to each municipality's <strong>compliance with state housing mandates</strong>. 
            Communities with <strong>higher shares of single-family zoning</strong> tend to show <strong>lower and more variable compliance</strong>, suggesting that <strong>restrictive zoning may limit housing access</strong> for moderate-income households. 
            Together, these tools make <strong>the impact of zoning policies visible</strong>—highlighting <strong>where zoning creates barriers</strong> and <strong>where reform could open doors</strong> to more equitable housing opportunities.
          </p>          
        </div>
      
        <!-- 🔽 Bottom-aligned scatterplot -->
        <div style="font-size: 1rem; font-weight: 600; color: #5c5145; margin-bottom: 0.5rem; text-align: center;">
          Zoning Compliance vs. Single-Family Housing Share
        </div>
        <div id="compliance-boxplot"></div>
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
        </div>
      </div>
    </div>
  </section>

</main>
  
<footer style="
    color: white;
    padding: 2rem 20px;
    text-align: center;
  ">

  <div style="
    font-size: 1.3rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    text-align: center;
  ">
    Acknowledgements
  </div>

  <div style="
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    font-size: 1rem;
    color: white;
    margin-bottom: 1.5rem;
    text-align: center;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    ">
    <p style="margin: 0;">
    This project was developed with guidance and feedback from the  
    <a href="https://www.mapc.org" style="color: white; text-decoration: underline;">
      Metropolitan Area Planning Council (MAPC)
    </a> 
    as part of MIT's <em>Data Visualization and Society</em> course.
    </p>
    <p style="margin: 0;">
    We’re grateful to the course staff for their support throughout the semester—especially in helping us clarify our ideas, iterate on design, and ground our work in real community impact.
    </p>
    <p style="margin: 0;">
    Comic illustrations were generated with AI to visualize key moments across housing history.
    </p>
  </div>

  <div style="
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
  ">
    References
  </div>

  <!-- References in the footer -->
  <div style="
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
  ">
    <a href="https://www.bostonfairhousing.org/timeline/1950s-1975-Suburbs.html"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Boston Fair Housing
    </a >
    <a href="https://www.bostonindicators.org/-/media/indicators/boston-indicators-reports/report-files/exclusionarybydesign_report_nov_8.pdf"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Exclusionary by Design
    </a >
    <a href="https://www.bostonplans.org/getattachment/43eefea6-85ae-48ee-965a-6358ea84bc7e"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Boston's Inclusionary Development Policy
    </a >
    <a href="https://www.mass.gov/info-details/mbta-communities-law-qa"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      MBTA Communities Law
    </a >
    <a href="https://www.nerdwallet.com/article/mortgages/average-down-payment-on-a-house"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Average Down Payment on a House
    </a >
    <a href="https://www.chase.com/personal/mortgage/education/financing-a-home/what-percentage-income-towards-mortgage"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Income Toward Mortgage
    </a >
  </div>

  <!-- Data Sources -->
  <div style="
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
  ">
    Data Sources
  </div>
  <div style="
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
  ">
    <a href="https://www.mass.gov/info-details/massgis-data-2020-us-census-towns"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Boston Census 2020
    </a >
    <a href="https://datacommon.mapc.org/browser/datasets/390"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      MAPC Parcel Zoning Compliance Data
    </a >
    <a href="https://datacommon.mapc.org/browser/datasets/421"
       style="color: white; text-decoration: underline; font-size: 1rem;">
      Boston Single Family Zoning Data
    </a >
  </div>

  <!-- Project credits -->
  <div style="font-size: 0.9rem;">
    Blueprint Boston | Yi Suo, Mingzhen Qi, Tiffany Wang | Spring 2025
  </div>
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
  <a href="#home" data-tooltip="Home" class="home-icon" aria-label="Go to Home Page"></a>
  <a href="#housing_struggle" data-tooltip="Housing Struggles" aria-label="Go to Housing Struggles Section"></a>
  <a href="#housing_timeline" data-tooltip="Housing Timeline" aria-label="Go to Housing Timeline Section"></a>
  <a href="#key-takeaways" data-tooltip="Navigation" aria-label="Go to Navigation Section"></a>
  <a href="#price" data-tooltip="Affordability" aria-label="Affordability"></a>
  <a href="#timeline" data-tooltip="Housing Growth" aria-label="Go to Housing Growth Section"></a>
  <a href="#map" data-tooltip="Housing Access" aria-label="Go to Housing Access Section"></a>
</div>
