<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import * as d3 from 'd3';

  let map;
  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  // Map configuration:
  let longitude = -71.0589;
  let latitude = 42.3601;
  let zoom = 8.5;

  // Filter state stored as arrays.
  // The button logic remains unchanged.
  // An empty array for a category means "no filtering" (i.e. all values are accepted).
  let selectedIncome = [];
  let selectedFamily = [];

  // CSV data will be stored in a Map keyed by fid.
  let csvData = new Map();

  // Define income buckets – keys must match the labels on the buttons.
  const incomeBuckets = {
    'Under $25K': ['incu10', 'inc1015', 'inc1520', 'inc2025'],
    '$25K - $50K': ['inc2530', 'inc3035', 'inc3540', 'inc4045', 'inc4550'],
    '$50K - $75K': ['inc5060', 'inc6075'],
    '$75K - $100K': ['inc7585', 'inc85100'],
    '$100K - $150K': ['inc100125', 'inc125150'],
    '$150K & above': ['inc150200', 'inc200more']
  };

  // Define family fields – keys must match the labels.
  const familyFields = {
    '1-person': ['nfhh1'],
    '2-person': ['fhh2', 'nfhh2'],
    '3-person': ['fhh3', 'nfhh3'],
    '4-person': ['fhh4', 'nfhh4'],
    '5-person': ['fhh5p', 'nfhh5p'],
    '6-person': [],
    '7+ persons': []
  };

  const MATCH_THRESHOLD = 0.05; // Not used in the new logic for highlighting; our match is binary

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

  // Updated isMatch function:
  // - If both selectedIncome and selectedFamily are empty, return true (highlight all areas).
  // - Otherwise, for each active category, return true if the row has a positive value in at least one column.
  // - Across categories, the result is the logical AND.
  function isMatch(row) {
    // If no filters are active, highlight all.
    if (selectedIncome.length === 0 && selectedFamily.length === 0) {
      return true;
    }
    let incomeMatch = true;
    let familyMatch = true;
    if (selectedIncome.length > 0) {
      incomeMatch = selectedIncome.some(bucket =>
        incomeBuckets[bucket].some(col => (+row[col] || 0) > 0)
      );
    }
    if (selectedFamily.length > 0) {
      familyMatch = selectedFamily.some(bucket =>
        familyFields[bucket].some(col => (+row[col] || 0) > 0)
      );
    }
    return incomeMatch && familyMatch;
  }

  // onMount: Initialize the Mapbox map and load data.
  onMount(async () => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude, latitude],
      zoom: zoom
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Load the CSV data into a Map (keyed by fid).
    const rawCsv = await d3.csv('/housing_sf_other_w_census.csv');
    rawCsv.forEach(row => {
      csvData.set(row.fid, row);
    });

    // Wait for the map to load.
    await new Promise(resolve => map.on('load', resolve));

    // Load GeoJSON data.
    const zoning = await fetch('/housing_sf_other_w_census_reprojected.geojson')
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

    // Add fill layer with fill-color set conditionally on match.
    // If match equals 1, use the highlight color; otherwise, use the default.
    map.addLayer({
      id: 'zoning-fill',
      type: 'fill',
      source: 'zoning',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'match'], 1],
          '#c19770', // Highlighted fill when criteria are met.
          '#d6c7b3'  // Default fill when criteria not met.
        ],
        'fill-opacity': 0.7
      }
    });

    // // Add outline layer.
    // map.addLayer({
    //   id: 'zoning-outline',
    //   type: 'line',
    //   source: 'zoning',
    //   paint: {
    //     'line-color': '#bfa9a0',
    //     'line-width': 1
    //   }
    // });

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

  // Reactive block: Whenever selectedIncome or selectedFamily changes,
  // update the match property for each feature and refresh the map source.
  $: {
    console.log('Filters changed - Income:', selectedIncome, 'Family:', selectedFamily);
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
      <div class="map-container">
        <div id="map"></div>
      </div>

      <div class="filters-container">
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
  </section>

  <section class="filtered-output">
    <h3>Filtered Municipalities</h3>
    <p>
      The map highlights zoning areas that match the selected income and family size criteria.
    </p>
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
    gap: 2rem;
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
  #map {
    width: 100%;
    height: 100%;
  }
  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    min-width: 250px;
  }
  .filter-group {
    margin-bottom: 1rem;
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
  .filtered-output {
    margin: 2rem auto;
    padding: 1rem;
    border: 1px solid #bbb;
    border-radius: 8px;
    background: #fffaf3;
    width: 90%;
    max-width: 900px;
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
</style>
