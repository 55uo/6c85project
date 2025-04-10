<script>
  import { onMount } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import * as d3 from 'd3';

  let map;
  const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ';

  let longitude = -71.0589;
  let latitude = 42.3601;
  let zoom = 8.5;

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

    // Load the zoning geodata
    const zoning = await fetch('/housing_sf_other_w_census_reprojected.geojson').then(res => res.json());
    map.addSource('zoning', {
      type: 'geojson',
      data: zoning
    });

    // Color the zoning by municipality
    map.addLayer({
      id: 'zoning-fill',
      type: 'fill',
      source: 'zoning',
      paint: {
        'fill-color': '#d6c7b3',  // soft warm tan
        'fill-opacity': 0.5
      }
    });

    // Add the outline layer
    map.addLayer({
      id: 'zoning-outline',
      type: 'line',
      source: 'zoning',
      paint: {
        'line-color': '#bfa9a0',  // muted warm brown
        'line-width': 1
      }
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
          <button>Under $25K</button>
          <button>$25K - $50K</button>
          <button>$50K - $75K</button>
          <button>$75K - $100K</button>
          <button>$100K - $150K</button>
          <button>$150K & above</button>
        </div>

        <!-- Family Size -->
        <div class="filter-group">
          <h4>Family Size</h4>
          <button>1-person</button>
          <button>2-person</button>
          <button>3-person</button>
          <button>4-person</button>
          <button>5-person</button>
          <button>6-person</button>
          <button>7+ persons</button>
        </div>
      </div>
    </div>
  </section>

  <section class="filtered-output">
    <h3>Filtered Municipalities</h3>
    <p>Select income levels and family sizes to see matching municipalities.</p>
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

  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    min-width: 250px;
  }

  #map {
    width: 100%;
    height: 100%;
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
</style>
