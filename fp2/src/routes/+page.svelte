<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import * as d3 from 'd3';

  let map;
  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  let longitude = -71.0589;
  let latitude = 42.3601;
  let zoom = 8.5;
  let zoning; // Store the full zoning data
  let csvData = new Map();

  // Track selected filters
  let selectedIncomeLevels = [];
  let selectedFamilySizes = [];

  // Define the mapping of button labels to data columns
  const incomeBuckets = {
    'Under $25K': ['hh_inc_under_25k'],
    '$25K - $50K': ['hh_inc_25k_50k'],
    '$50K - $75K': ['hh_inc_50k_75k'],
    '$75K - $100K': ['hh_inc_75k_100k'],
    '$100K - $150K': ['hh_inc_100k_150k'],
    '$150K & above': ['hh_inc_150k_plus']
  };

  const familyFields = {
    '1-person': ['hh_size_1'],
    '2-person': ['hh_size_2'],
    '3-person': ['hh_size_3'],
    '4-person': ['hh_size_4'],
    '5-person': ['hh_size_5'],
    '6-person': ['hh_size_6'],
    '7+ persons': ['hh_size_7_plus']
  };

  async function loadCsvData() {
    const rawCsv = await d3.csv('/housing_sf_other_w_census.csv');
    rawCsv.forEach(row => {
      csvData.set(row.fid.trim(), row);
    });
  }

  let filteredFids = [];
  let filteredMunicipalities = [];

  function toggleIncome(option) {
    selectedIncomeLevels = toggleValue(selectedIncomeLevels, option);
    updateMap();
  }

  function toggleFamily(size) {
    selectedFamilySizes = toggleValue(selectedFamilySizes, size);
    updateMap();
  }

  function toggleValue(arr, value) {
    return arr.includes(value)
      ? arr.filter(v => v !== value)
      : [...arr, value];
  }

  function getMatchScore(row) {
    // All relevant column keys
    const allIncomeKeys = Object.values(incomeBuckets).flat();
    const allFamilyKeys = Object.values(familyFields).flat();
    const totalKeys = [...allIncomeKeys, ...allFamilyKeys];

    // Total sum of values in those columns for normalization
    const totalScore = totalKeys.reduce((sum, col) => sum + (+row[col] || 0), 0);

    let incomeScore = 0;
    let familyScore = 0;

    // Sum over all selected income ranges
    if (selectedIncomeLevels.length > 0) {
      selectedIncomeLevels.forEach(level => {
        if (incomeBuckets[level]) {
          incomeScore += incomeBuckets[level].reduce((sum, col) => sum + (+row[col] || 0), 0);
        }
      });
    }

    // Sum over all selected family sizes
    if (selectedFamilySizes.length > 0) {
      selectedFamilySizes.forEach(size => {
        if (familyFields[size]) {
          familyScore += familyFields[size].reduce((sum, col) => sum + (+row[col] || 0), 0);
        }
      });
    }

    const rawScore = incomeScore + familyScore;
    const normalizedScore = totalScore > 0 ? rawScore / totalScore : 0;
  
    console.log('Score calculation for', row.muni, ':', {
      incomeScore,
      familyScore,
      totalScore,
      normalizedScore
    });
  
    return normalizedScore;
  }

  function getFilteredFids() {
    filteredFids = [];

    for (let [fid, row] of csvData.entries()) {
      const score = getMatchScore(row);
      if (score > 0.05) {
        filteredFids.push(fid); // or you could push row.muni instead
      }
    }
  };

  function getFilteredMunicipalities() {
    if (!zoning || !zoning.features) return [];
    
    const filtered = zoning.features.filter(feature => {
      const row = csvData.get(String(feature.properties.fid).trim());
      const score = row ? getMatchScore(row) : 0;
      return score > 0.5;
    });
    return filtered;
  }

  function updateMap() {
    if (!map || !map.getSource('zoning')) return;
    
    const filtered = getFilteredMunicipalities();
    const filteredData = {
      type: 'FeatureCollection',
      features: filtered
    };
    map.getSource('zoning').setData(filteredData);
  }

  function applyFilters() {
    filteredMunicipalities = getFilteredMunicipalities().map(f => f.properties.muni);
    updateMap();
  }

  async function initMap() {
    // Initialize the map
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude, latitude],
      zoom: zoom
    });

    // Wait for the map to load
    await new Promise(resolve => map.on("load", resolve));

    // Load both the zoning data and CSV data
    await Promise.all([
      loadCsvData(),
      fetch('/housing_sf_other_w_census_reprojected.geojson').then(res => res.json())
    ]).then(([_, zoningData]) => {
      zoning = zoningData;
      map.addSource('zoning', {
        type: 'geojson',
        data: zoning
      });

      // Add the layers
      map.addLayer({
        id: 'zoning-fill',
        type: 'fill',
        source: 'zoning',
        paint: {
          'fill-color': '#d6c7b3',
          'fill-opacity': 0.5
        }
      });

      map.addLayer({
        id: 'zoning-outline',
        type: 'line',
        source: 'zoning',
        paint: {
          'line-color': '#bfa9a0',
          'line-width': 1
        }
      });
    });

    // hover effect
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    map.on('mouseenter', 'zoning-fill', (e) => {
      map.getCanvas().style.cursor = 'pointer';

      const feature = e.features[0];
      const muni = feature.properties.muni;

      popup
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${muni}</strong>`)
        .addTo(map);
    });

    map.on('mouseleave', 'zoning-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
  }

  onMount(() => {
    initMap();
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  });

</script>

<!-- Page Layout -->
<div class="page">
  <section class="intro">
    <h1>Explore Housing Access in Greater Boston</h1>
    <p>
      Use our interactive zoning map to understand how policies shape affordability—
      and discover where you might call home.
    </p>
  </section>

  <section class="map-section">
    <div class="map-and-filters">
      <div class="map-container">
        <div id="map"></div>
      </div>

      <div class="filters-container">
        <!-- Income Level -->
        <div class="filter-group">
          <h4>Income Level</h4>
          {#each Object.keys(incomeBuckets) as incomeLevel}
            <button 
              class:active={selectedIncomeLevels.includes(incomeLevel)}
              on:click={() => toggleIncome(incomeLevel)}>
              {incomeLevel}
            </button>
          {/each}
        </div>

        <!-- Family Size -->
        <div class="filter-group">
          <h4>Family Size</h4>
          {#each Object.keys(familyFields) as familySize}
            <button 
              class:active={selectedFamilySizes.includes(familySize)}
              on:click={() => toggleFamily(familySize)}>
              {familySize}
            </button>
          {/each}
        </div>

        <button class="apply-button" on:click={applyFilters}>
          Apply Filters
        </button>
      </div>
    </div>
  </section>

  <section class="filtered-output">
    <h3>Filtered Municipalities</h3>
    <p>Select income levels and family sizes, then click Apply to see matching municipalities.</p>
    {#if filteredMunicipalities.length > 0}
      <div class="municipalities-list">
        {#each filteredMunicipalities as muni}
          <div class="municipality-item">{muni}</div>
        {/each}
      </div>
    {:else}
      <p class="no-results">No municipalities match the selected filters.</p>
    {/if}
  </section>  

  <section class="conclusion">
    <h2>Why Zoning Reform Matters</h2>
    <p>
      With 65% of Greater Boston zoned for single-family homes,
      multi-family and affordable options are scarce.
      Zoning reform can help build a more inclusive and equitable housing future.
    </p>
  </section>
</div>

<style>
  @import 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';

  .page {
    font-family: sans-serif;
    background: #f6f0e8;
    color: #3e3e3e;
    margin: 0;
    padding: 0;
  }

  .intro {
    background: #d8a59c;
    padding: 3rem 1rem;
    text-align: center;
    color: white;
  }

  .intro h1 {
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }

  .intro p {
    max-width: 600px;
    margin: 0 auto;
    font-size: 1.2rem;
  }

  .map-section {
    padding: 2rem 1rem;
    background: white;
  }

  .map-and-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-start;
    align-items: flex-start;
    max-width: 1200px;
    margin: 0 auto;
  }

  .map-container {
    background: #d6c7b3;
    width: 100%;
    max-width: 800px;
    height: 600px;
    border-radius: 10px;
    overflow: hidden;
  }

  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem; /* was 1rem */
    margin-top: 0.25rem; /* optional: bring closer to top */
    padding: 0.5rem;      /* was 1rem */
    min-width: 220px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  #map {
    width: 100%;
    height: 100%;
  }

  .filter-group {
    margin-bottom: 0.5rem;
    width: 100%;
  }

  .filter-group h4 {
    font-size: 0.9rem;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 0.5rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid #eee;
  }

  .filter-group button {
    display: block;
    width: 100%;
    text-align: left;
    background: #f5f5f5;
    color: #333;
    border: 1px solid #e0e0e0;
    padding: 0.5rem 0.8rem;
    margin: 0.2rem 0;
    border-radius: 4px;
    font-family: monospace;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-group button:hover {
    background: #e8e8e8;
    transform: translateY(-1px);
  }

  .filter-group button.active {
    background: #d8a59c;     /* warm tone */
    color: white;
    border-color: #d8a59c;
    transform: translateY(-1px);
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .apply-button {
    width: 100%;
    padding: 0.8rem;
    margin-top: 0.5rem;
    background: #d8a59c;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .apply-button:hover {
    background: #c49489;
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    .map-and-filters {
      flex-direction: column;
      align-items: center;
    }

    .map-container {
      height: 400px;
    }

    .filters-container {
      width: 100%;
      max-width: 800px;
    }
  }

  .conclusion {
    background: #bfa9a0;
    color: white;
    text-align: center;
    padding: 3rem 1rem;
  }

  .conclusion h2 {
    font-size: 1.8rem;
    margin-bottom: 1rem;
  }

  .conclusion p {
    max-width: 700px;
    margin: 0 auto;
    font-size: 1.1rem;
  }

  .filtered-output {
    margin: 2rem auto;
    padding: 1rem;
    border: 1px solid #bbb;
    border-radius: 8px;
    background: #fffaf3;
    width: 90%;
    max-width: 900px;
  }

  .municipalities-list {
    margin-top: 1rem;
    max-height: 300px;
    overflow-y: auto;
    background: white;
    border-radius: 4px;
    padding: 1rem;
  }

  .municipality-item {
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
  }

  .municipality-item:last-child {
    border-bottom: none;
  }

  .no-results {
    color: #666;
    font-style: italic;
  }
</style>
