<script>
  import { onMount } from "svelte";
  import mapboxgl from "mapbox-gl";
  import * as d3 from "d3";

  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  let longitude = -71.0589;
  let latitude = 42.3601;
  let zoom = 9;

  let zoningMap;
  let singleFamilyGeo;
  let selectedIncomeLevel = 0; // slider value (0-5)

  // Precomputed cache
  let incomeCache = new Map();

  // Define groups of columns for each income level
  const incomeLevelGroups = [
    ['incu10', 'inc1015', 'inc1520', 'inc2025'],                      // <25k
    ['inc2530', 'inc3035', 'inc3540', 'inc4045', 'inc4550'],           // 25k–50k
    ['inc5060', 'inc6075', 'i7599'],                                   // 50k–100k
    ['i100125', 'i125150'],                                            // 100k–150k
    ['i150200'],                                                       // 150k–200k
    ['in200o']                                                         // >200k
  ];

  async function loadData() {
    const singleFamilyCsv = await d3.csv('/single_family_zoning/housing_sf_other_w_census.csv');
    singleFamilyGeo = await d3.json('/single_family_zoning/housing_sf_other_w_census_reprojected.json');

    // Build CSV map
    singleFamilyCsvData = new Map();
    singleFamilyCsv.forEach(row => {
      singleFamilyCsvData.set(parseInt(row.fid), row);
    });

    // Build precomputed cache
    singleFamilyCsv.forEach(row => {
      const fid = row.fid;
      const totalHouseholds = parseFloat(row.hh || 0);

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
  }


  async function initZoningMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    zoningMap = new mapboxgl.Map({
      container: 'income-map', // Make sure your HTML map container ID matches
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [longitude, latitude],
      zoom: zoom
    });

    zoningMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

    zoningMap.on('load', () => {
      updateIncomeLayer(); // Draw initial map
    });
  }

  function updateIncomeLayer() {
    if (zoningMap.getLayer('income-layer')) {
      zoningMap.removeLayer('income-layer');
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

    zoningMap.addLayer({
      id: 'income-layer',
      type: 'fill',
      source: 'income-source',
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['get', 'income_percentage'],
          0, '#f7fbff',
          0.1, '#deebf7',
          0.2, '#c6dbef',
          0.4, '#6baed6',
          0.6, '#2171b5'
        ],
        'fill-opacity': 0.7
      }
    });
  }

  function onIncomeChange(event) {
    selectedIncomeLevel = parseInt(event.target.value);
    updateIncomeLayer();
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
              <button class="nav-link active custom-tab" id="income-tab" data-bs-toggle="tab" data-bs-target="#income" type="button" role="tab">By Income</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link custom-tab" id="demographics-tab" data-bs-toggle="tab" data-bs-target="#demographics" type="button" role="tab">By Demographics</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link custom-tab" id="family-tab" data-bs-toggle="tab" data-bs-target="#family" type="button" role="tab">By Family Size</button>
            </li>
          </ul>
          <!-- Slider for Income Level -->
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
        </div>

        <div class="tab-content">
          <!-- By Income Tab -->
          <div class="tab-pane fade show active" id="income" role="tabpanel">
            <div class="d-flex justify-content-center">
              <div class="box" style="height: 500px; width: 100%; max-width: 1200px; background-color: #e9e3d9;">
                <div id="income-map" style="height: 100%; width: 100%;"></div>
              </div>
            </div>
          </div>          

          <!-- By Demographics Tab -->
          <div class="tab-pane fade" id="demographics" role="tabpanel">
            <div class="row g-4 justify-content-center">
              <div class="col-md-4">
                <div class="box">
                  <label for="demographicSelect" class="form-label fw-bold">Demographic</label>
                  <select id="demographicSelect" class="form-select">
                    <option>All</option>
                    <option>Black</option>
                    <option>Hispanic</option>
                    <option>Asian</option>
                  </select>
                </div>
              </div>
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
        <div class="analysis-box">
        [ What do you notice about access, demographics, and income distribution? ]
        </div>
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