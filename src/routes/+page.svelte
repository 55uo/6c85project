<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import * as d3 from 'd3';

  let map;
  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  // Map configuration:
  let longitude = -71.0589;
  let latitude = 42.3601;
  let zoom = 9; // Default zoom adjusted to 8

  // Filter state stored as arrays.
  let selectedIncome = [];
  let selectedFamily = [];

  // CSV data will be stored in a Map keyed by fid.
  let csvData = new Map();

  // Toggle to show top 10 matches.
  let showTop10 = false;

  // Define income buckets – keys must match the labels on the buttons.
  const incomeBuckets = {
    'Under $25K': ['incu10', 'inc1015', 'inc1520', 'inc2025'],
    '$25K - $50K': ['inc2530', 'inc3035', 'inc3540', 'inc4045', 'inc4550'],
    '$50K - $75K': ['inc5060', 'inc6075'],
    '$75K - $100K': ['i7599'],
    '$100K - $150K': ['i100125', 'i125150'],
    '$150K & above': ['i150200', 'in200o']
  };

  // Define family fields – keys must match the labels.
  const familyFields = {
    '1-person': ['nfhh1'],
    '2-person': ['fhh2', 'nfhh2'],
    '3-person': ['fhh3', 'nfhh3'],
    '4-person': ['fhh4', 'nfhh4'],
    '5-person': ['fhh5', 'nfhh5'],
    '6-person': ['fhh6', 'nfhh6'],
    '7+ persons': ['fhh7o', 'nfhh7o']
  };

  // Toggle functions for filter buttons.
  function toggleIncome(bucket) {
    if (bucket === 'All Income Levels') {
      selectedIncome = [];
    } else if (selectedIncome.includes(bucket)) {
      selectedIncome = selectedIncome.filter(b => b !== bucket);
    } else {
      selectedIncome = [...selectedIncome, bucket];
    }
  }

  function toggleFamily(bucket) {
    if (bucket === 'All Family Sizes') {
      selectedFamily = [];
    } else if (selectedFamily.includes(bucket)) {
      selectedFamily = selectedFamily.filter(b => b !== bucket);
    } else {
      selectedFamily = [...selectedFamily, bucket];
    }
  }

  function resetFilters() {
    selectedIncome = [];
    selectedFamily = [];
  }

  function toggleTop10View() {
    showTop10 = !showTop10;
  }


  // Updated isMatch function:
  // function isMatch(row) {
  //   if (selectedIncome.length === 0 && selectedFamily.length === 0) {
  //     return true;
  //   }
  //   let incomeMatch = true;
  //   let familyMatch = true;
  //   if (selectedIncome.length > 0) {
  //     incomeMatch = selectedIncome.some(bucket =>
  //       incomeBuckets[bucket].some(col => (+row[col] || 0) > 0)
  //     );
  //   }
  //   if (selectedFamily.length > 0) {
  //     familyMatch = selectedFamily.some(bucket =>
  //       familyFields[bucket].some(col => (+row[col] || 0) > 0)
  //     );
  //   }
  //   return incomeMatch && familyMatch;
  // }

  // Example thresholds for normalized scores.
  // For instance, if the average value is greater than or equal to 0.5, consider it a match.
  const incomeThreshold = 0.5;
  const familyThreshold = 0.5;

  /**
   * Enhanced filtering function with normalization:
   * - For each category, sum the values from all columns in the selected buckets.
   * - Divide by the total number of values (i.e., the number of columns across all selected buckets) to get an average.
   * - The row is a match if the normalized (average) score in each active category exceeds the threshold.
   */
  function isMatch(row) {
    // If no filters active at all, highlight all.
    if (selectedIncome.length === 0 && selectedFamily.length === 0) {
      return true;
    }

    let incomeSum = 0;
    let incomeCount = 0;
    let familySum = 0;
    let familyCount = 0;

    // Compute normalized income score if any income filters are selected.
    if (selectedIncome.length > 0) {
      selectedIncome.forEach(bucket => {
        incomeBuckets[bucket].forEach(col => {
          incomeSum += (+row[col] || 0);
          incomeCount++;
        });
      });
    }
    // Compute normalized family score if any family filters are selected.
    if (selectedFamily.length > 0) {
      selectedFamily.forEach(bucket => {
        familyFields[bucket].forEach(col => {
          familySum += (+row[col] || 0);
          familyCount++;
        });
      });
    }

    // Calculate average (normalized) score for each category.
    const incomeScore = incomeCount > 0 ? incomeSum / incomeCount : 0;
    const familyScore = familyCount > 0 ? familySum / familyCount : 0;

    // Determine if each category meets its threshold.
    const incomeMatch = selectedIncome.length > 0 ? (incomeScore >= incomeThreshold) : true;
    const familyMatch = selectedFamily.length > 0 ? (familyScore >= familyThreshold) : true;

    return incomeMatch && familyMatch;
  }

  // Function to compute a raw score for a municipality.
  // Here we simply sum all the income and family columns across all buckets.
  // (You can modify this function to include weights or normalization as needed.)
  function computeScore(row) {
    let score = 0;
    Object.values(incomeBuckets).forEach(bucket => {
      bucket.forEach(col => {
        score += (+row[col] || 0);
      });
    });
    Object.values(familyFields).forEach(bucket => {
      bucket.forEach(col => {
        score += (+row[col] || 0);
      });
    });
    return score;
  }

   // Function to update the map data using the normal filtering logic.
   function updateMap() {
    if (map && map.isStyleLoaded() && map.getSource('zoning') && csvData.size > 0) {
      const source = map.getSource('zoning');
      const geojson = source._data;
      geojson.features.forEach(f => {
        const row = csvData.get(String(f.properties.fid).trim());
        f.properties.match = row ? (isMatch(row) ? 1 : 0) : 0;
      });
      source.setData(geojson);
    }
  }

  // Function to update the map data to highlight only the top 10 scored municipalities.
  function updateTop10() {
    if (map && map.isStyleLoaded() && map.getSource('zoning') && csvData.size > 0) {
      const source = map.getSource('zoning');
      const geojson = source._data;
      // Compute score for each feature.
      geojson.features.forEach(f => {
        const row = csvData.get(String(f.properties.fid).trim());
        f.properties.score = row ? computeScore(row) : 0;
      });
      // Sort features descending by score.
      const sorted = [...geojson.features].sort((a, b) => b.properties.score - a.properties.score);
      // Get the top 10 fids.
      const top10Fids = new Set(sorted.slice(0, 10).map(f => f.properties.fid));
      // Update match: only features in top10 get highlighted.
      geojson.features.forEach(f => {
        f.properties.match = top10Fids.has(f.properties.fid) ? 1 : 0;
      });
      source.setData(geojson);
    }
  }

  // Function to recenter the map.
  function recenterMap() {
    if (map) {
      map.flyTo({
        center: [longitude, latitude],
        zoom: zoom
      });
    }
  }

  // onMount: Initialize the map and load data.
  onMount(async () => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude, latitude],
      zoom: zoom
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Load CSV data
    const rawCsv = await d3.csv(import.meta.env.BASE_URL + '/housing_sf_other_w_census.csv');
    rawCsv.forEach(row => {
      csvData.set(row.fid, row);
    });

    // Wait for the map to load.
    await new Promise(resolve => map.on('load', resolve));

    // Load GeoJSON data.
    const zoning = await fetch(import.meta.env.BASE_URL + '/housing_sf_other_w_census_reprojected.json')
                          .then(res => res.json());

    // Compute initial match property for each feature.
    zoning.features.forEach(f => {
      const row = csvData.get(f.properties.fid);
      f.properties.match = row ? (isMatch(row) ? 1 : 0) : 0;
    });

    // Add GeoJSON source.
    map.addSource('zoning', {
      type: 'geojson',
      data: zoning
    });

    // Add fill layer with updated fill colors.
    map.addLayer({
      id: 'zoning-fill',
      type: 'fill',
      source: 'zoning',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'match'], 1],
          '#ff7f50',  // Filtered highlight: darker coral
          '#ffccb3'   // Default fill: light coral
        ],
        'fill-opacity': 0.7
      }
    });

    // Setup hover popup.
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
    map.on('mouseenter', 'zoning-fill', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features[0];
      const muni = feature.properties.muni;
      popup.setLngLat(e.lngLat)
           .setHTML(`<strong>${muni}</strong>`)
           .addTo(map);
    });
    map.on('mouseleave', 'zoning-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
  });

  // Reactive block to update the map when filters change.
  $: {
    console.log('Filters changed - Income:', selectedIncome, 'Family:', selectedFamily);
    if (map && map.isStyleLoaded() && map.getSource('zoning') && csvData.size > 0) {
      if (showTop10) {
        updateTop10();
      } else {
        updateMap();
      }
    }
  }

</script>

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
      <!-- Sidebar containing Filters -->
      <div class="sidebar">
        <div class="filters-container">
          <!-- Top 10 toggle button -->
          <button class="top10-button" on:click={toggleTop10View}>
            {showTop10 ? "Show All" : "Show Top 10"}
          </button>
          <!-- Income Level Filter Group -->
          <div class="filter-group">
            <h4>Income Level</h4>
            <button on:click={() => toggleIncome('All Income Levels')}
                    class:active={selectedIncome.length === 0}>
              All Income Levels
            </button>
            <button on:click={() => toggleIncome('Under $25K')}
                    class:active={selectedIncome.includes('Under $25K')}>
              Under $25K
            </button>
            <button on:click={() => toggleIncome('$25K - $50K')}
                    class:active={selectedIncome.includes('$25K - $50K')}>
              $25K - $50K
            </button>
            <button on:click={() => toggleIncome('$50K - $75K')}
                    class:active={selectedIncome.includes('$50K - $75K')}>
              $50K - $75K
            </button>
            <button on:click={() => toggleIncome('$75K - $100K')}
                    class:active={selectedIncome.includes('$75K - $100K')}>
              $75K - $100K
            </button>
            <button on:click={() => toggleIncome('$100K - $150K')}
                    class:active={selectedIncome.includes('$100K - $150K')}>
              $100K - $150K
            </button>
            <button on:click={() => toggleIncome('$150K & above')}
                    class:active={selectedIncome.includes('$150K & above')}>
              $150K & above
            </button>
          </div>

          <!-- Family Size Filter Group -->
          <div class="filter-group">
            <h4>Family Size</h4>
            <button on:click={() => toggleFamily('All Family Sizes')}
                    class:active={selectedFamily.length === 0}>
              All Family Sizes
            </button>
            <button on:click={() => toggleFamily('1-person')}
                    class:active={selectedFamily.includes('1-person')}>
              1-person
            </button>
            <button on:click={() => toggleFamily('2-person')}
                    class:active={selectedFamily.includes('2-person')}>
              2-person
            </button>
            <button on:click={() => toggleFamily('3-person')}
                    class:active={selectedFamily.includes('3-person')}>
              3-person
            </button>
            <button on:click={() => toggleFamily('4-person')}
                    class:active={selectedFamily.includes('4-person')}>
              4-person
            </button>
            <button on:click={() => toggleFamily('5-person')}
                    class:active={selectedFamily.includes('5-person')}>
              5-person
            </button>
            <button on:click={() => toggleFamily('6-person')}
                    class:active={selectedFamily.includes('6-person')}>
              6-person
            </button>
            <button on:click={() => toggleFamily('7+ persons')}
                    class:active={selectedFamily.includes('7+ persons')}>
              7+ persons
            </button>
          </div>

          <!-- Reset Button -->
          <div class="filter-group">
            <button on:click={resetFilters} class="reset-button">
              Reset All Filters
            </button>
          </div>
        </div>
      </div>

      <!-- Map Container with Legend and Recenter Button -->
      <div class="map-container">
        <div id="map"></div>
        <button class="recenter-button" on:click={recenterMap}>Recenter</button>
        <div class="legend">
          <h4>Legend</h4>
          <div class="legend-item">
            <span class="color-box default"></span>
            <span>Default</span>
          </div>
          <div class="legend-item">
            <span class="color-box highlighted"></span>
            <span>Filtered</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer placed at the end of the page -->
  <footer class="footer">
    <p>© 2025 Blueprint Boston.</p>
  </footer>
</div>

<style>
  @import 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';

  .page {
    font-family: sans-serif;
    background: #f6f0e8;
    color: #3e3e3e;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
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
    flex-grow: 1;
  }
  .map-and-filters {
    display: flex;
    flex-wrap: nowrap;
    gap: 2rem;
    justify-content: center;
    align-items: stretch;
    max-width: 1200px;
    margin: 0 auto;
  }
  /* Sidebar: contains the filters */
  .sidebar {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    min-width: 250px;
  }
  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .filter-group {
    width: 100%;
  }
  .filter-group h4 {
    font-size: 0.9rem;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 0.5rem;
  }
  .filter-group button {
    display: block;
    width: 100%;
    text-align: left;
    background: #e0e0e0;
    color: #333;
    border: none;
    padding: 0.6rem 0.8rem;
    margin: 0.25rem 0;
    border-radius: 4px;
    font-family: monospace;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .filter-group button:hover {
    background: #ccc;
    transform: translateY(-2px);
  }
  .filter-group button:active {
    background: #d8a59c;
    color: white;
  }
  .filter-group button.active {
    background: #d8a59c;
    color: white;
  }
  .reset-button {
    background: #ff6347;
    color: white;
    font-weight: bold;
  }
  .map-container {
    background: #d6c7b3;
    width: 100%;
    max-width: 800px;
    height: 600px;
    position: relative;
    border-radius: 10px;
    overflow: hidden;
  }
  #map {
    width: 100%;
    height: 100%;
  }
  .legend {
    position: absolute;
    bottom: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.9);
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .legend h4 {
    margin: 0 0 0.5rem 0;
  }
  .legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 0.3rem;
  }
  .legend-item:last-child {
    margin-bottom: 0;
  }
  .color-box {
    width: 20px;
    height: 20px;
    margin-right: 0.5rem;
    border: 1px solid #ccc;
  }
  .color-box.default {
    background-color: #ffccb3;
  }
  .color-box.highlighted {
    background-color: #ff7f50;
  }
  .recenter-button {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #d8a59c;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    transition: background 0.2s ease;
  }
  .recenter-button:hover {
    background: #bfa9a0;
  }
  .footer {
    background: #bfa9a0;
    text-align: center;
    padding: 1rem;
    color: white;
    font-size: 0.9rem;
  }
</style>
