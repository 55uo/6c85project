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

  // Precomputed cache
  let incomeCache = new Map();
  let demoCache = new Map();

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

    // Build CSV map
    singleFamilyCsvData = new Map();
    singleFamilyCsv.forEach(row => {
      singleFamilyCsvData.set(parseInt(row.fid), row);
    });

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

    if (zoningMap.getLayer('income-layer')) {
      zoningMap.removeLayer('income-layer');
    }
    if (zoningMap.getLayer('income-highlight')) {
      zoningMap.removeLayer('income-highlight');
    }
    if (zoningMap.getSource('income-source')) {
      zoningMap.removeSource('income-source');
    }

    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.fid;
        const percentages = incomeCache.get(fid) || [0, 0, 0, 0, 0, 0];
        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            income_percentage: percentages[selectedIncomeLevel]
          }
        };
      })
    };

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
          ['get', 'income_percentage'],
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
      const density = (props.income_percentage * 100).toFixed(1) + '%';

      const infoBox = document.getElementById('hover-info');
      if (infoBox) {
        infoBox.innerHTML = `
          <strong>${muniName}</strong><br/>
          <b>Density:</b> ${density}<br/>
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

  function updateDemographicsLayer() {
    console.log(activeTab);
    if (activeTab !== 'demographics') {
      return;
    }

    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.fid;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));
        let value = 0;
        if (csvRow && demographicColumns[selectedDemographic]) {
          const pop = parseFloat(csvRow.pop || 0);
          value = (pop > 0) ? (parseFloat(csvRow[demographicColumns[selectedDemographic]]) / pop) : 0;
        }
        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            demo_percentage: value
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
            ['get', 'demo_percentage'],
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
        const density = (props.demo_percentage * 100).toFixed(1) + '%';

        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          infoBox.innerHTML = `
            <strong>${muniName}</strong><br/>
            <b>Density:</b> ${density}<br/>
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

    // Create updated GeoJSON with family size percentage
    const updatedGeojson = {
      type: 'FeatureCollection',
      features: singleFamilyGeo.features.map(f => {
        const fid = f.properties.fid;
        const csvRow = singleFamilyCsvData.get(parseInt(fid));
        const hhTotal = parseFloat(csvRow.hh || 0);
        const count = parseFloat(csvRow[selectedColumn] || 0);
        const density = (hhTotal > 0) ? (count / hhTotal) : 0; // fraction between 0–1

        return {
          ...f,
          id: fid,
          properties: {
            ...f.properties,
            family_percentage: density
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
            ['get', 'family_percentage'],
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
        const density = (props.family_percentage * 100).toFixed(1) + '%';

        const infoBox = document.getElementById('hover-info');
        if (infoBox) {
          infoBox.innerHTML = `
            <strong>${muniName}</strong><br/>
            <b>Density:</b> ${density}<br/>
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

  onMount(async () => {
    await loadData();
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
        <div class="box">
        <p>[ A paragraph discussing zoning origins, exclusionary practices, impacts on affordability. ]</p>
        </div>
        <div class="analysis-box">
        [ Add your analysis or commentary on zoning history here. ]
        </div>
    </section>

    <section id="price" class="alt-bg">
        <div class="section-header">Income vs Housing Price</div>
        <div class="box text-center" style="height: 400px;">
        [ Affordability Visualization Placeholder ]
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
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
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