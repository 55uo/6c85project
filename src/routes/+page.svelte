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

<section id="hero" style="
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
      Reforming Zoning<br>for <span style="color: #d4a593;">Affordable Housing</span>
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
    </p>

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
    </a>
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
    #hero a:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.1);
    }
    #hero a:hover span:last-child {
      width: 100%;
    }
  </style>
</section>



<section id="history-intro" style="padding: 60px 20px 40px 20px; background: #f9f4ef;">
  <div class="section-header" style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center;">The Evolution of Zoning in Boston</div>

  <div style="text-align: center; margin-bottom: 2rem;">
    <img src="/images/zoning_laws.jpg" alt="Zoning Laws Timeline" 
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
      </p>
      <p style="font-style: italic; font-size: 1rem; color: #777; text-align: center;">
        The map of the city was being redrawn — but not for everyone's benefit
      </p>
    </div>

    <!-- Combined Impact + Future -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 2rem;">
      <div>
        <h3 style="font-size: 1.5rem; color: #5c5145; margin-bottom: 1rem;">Lasting Consequences</h3>
        <p style="font-size: 1.15rem; line-height: 1.7; color: #333;">
          These policies created <strong>lasting divides</strong> — today's housing prices, 
          neighborhood segregation, and limited affordable options still reflect 
          century-old zoning choices.
        </p>
        <div style="text-align: center; margin: 1.5rem 0;">
          <img src="/images/figure1.jpg" alt="Zoning Impact" 
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
        </p>
        <p style="font-style: italic; font-size: 1rem; color: #777; margin-top: 1.5rem;">
          We can build a better future — if we change how we plan it
        </p>
      </div>
    </div>
  </div>
</section>


<!-- Page 1: Ancestral Housing Struggle -->
<section style="max-width: 900px; margin: 3rem auto; padding: 0 20px;">
  <div style="
      background: #f9f4ef;
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  ">
    <!-- Comic image -->
    <img
      src="/images/comic-ancestors.png"
      alt="Ancestors Searching for Housing"
      style="width: 100%; border-radius: 8px; margin-bottom: 1.5rem;"
    />

    <!-- Header -->
    <h2 style="font-size: 2.5rem; font-weight: bold; color: #5c5145; text-align: center; margin-bottom: 1rem;">
      Ancestral Housing Struggle
    </h2>

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


<!-- Page 2: Boston’s Zoning Laws Timeline -->
<section style="max-width: 900px; margin: 3rem auto; padding: 0 20px;">
  <div style="
      background: #f9f4ef;
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  ">
    <!-- Comic image -->
    <img
      src="/images/comic-zoning-timeline.png"
      alt="Boston Zoning Timeline Comic"
      style="width: 100%; border-radius: 8px; margin-bottom: 1.5rem;"
    />

    <!-- Header -->
    <h2 style="font-size: 2.5rem; font-weight: bold; color: #5c5145; text-align: center; margin-bottom: 1rem;">
      Boston’s Zoning Laws: A Timeline
    </h2>

    <!-- Guide text -->
    <p style="font-size: 1.2rem; line-height: 1.6; color: #7c6757; text-align: center; margin-bottom: 1.8rem;">
      From 1950s single-family zoning to today’s MBTA Communities Act, policy has shaped who gets to live where—and at what price.
    </p>

    <!-- Take-aways -->
    <ul style="list-style: disc inside; font-size: 1.1rem; line-height: 1.6; color: #7c6757; max-width: 700px; margin: 0 auto;">
      <li>1950s: Large-lot zoning limited density in suburbs.</li>
      <li>1980s: Redlining solidified segregation.</li>
      <li>2000s–today: Inclusionary & transit-oriented reforms seek to ease the crunch.</li>
    </ul>
  </div>
</section>


<section id="timeline" style="max-width:900px; margin:3rem auto; padding:0 20px;">
  <h2 style="font-size:2.5rem; text-align:center; color:#5c5145; margin-bottom:2rem;">
    Housing Struggles Across Decades
  </h2>

  <div style="position:relative; padding:2rem 0;">
    <!-- The vertical line -->
    <div style="
      position:absolute;
      top:0;
      left:50%;
      transform:translateX(-50%);
      width:4px;
      height:100%;
      background:#ddd;
    "></div>

    <!-- 1950s (Left) -->
    <div style="
      position:relative;
      width:50%;
      padding:1rem 2rem 1rem 0;
      box-sizing:border-box;
      text-align:right;
    ">
      <!-- Connector dot -->
      <div style="
        position:absolute;
        right:-9px;
        top:1.5rem;
        width:18px;
        height:18px;
        background:#f9f4ef;
        border:3px solid #5c5145;
        border-radius:50%;
      "></div>

      <div style="
        display:inline-block;
        background:white;
        border-radius:12px;
        padding:1rem;
        box-shadow:0 4px 12px rgba(0,0,0,0.08);
      ">
        <h3 style="margin:0 0 0.5rem; font-size:1.4rem; color:#5c5145;">1950s: </h3>
        <h3 style="margin:0 0 0.5rem; font-size:1.2rem; color:#5c5145;">Suburban Single-Family Zoning</h3>
        <img src="/images/comic-1950s.png" alt="1950s housing"
             style="width:200px; border-radius:6px; margin-bottom:0.5rem;" />
        <p style="margin:0; font-size:1rem; color:#7c6757; line-height:1.4;">
          In the post-war boom, Boston and its suburbs adopted large-lot, single-family zoning districts. Grandparents scoured rental ads—only to find costs climbing beyond reach.
        </p>
      </div>
    </div>

    <!-- 1980s (Right) -->
    <div style="
      position:relative;
      width:50%;
      left:50%;
      padding:1rem 0 1rem 2rem;
      box-sizing:border-box;
      text-align:left;
    ">
      <div style="
        position:absolute;
        left:-9px;
        top:1.5rem;
        width:18px;
        height:18px;
        background:#f9f4ef;
        border:3px solid #5c5145;
        border-radius:50%;
      "></div>

      <div style="
        display:inline-block;
        background:white;
        border-radius:12px;
        padding:1rem;
        box-shadow:0 4px 12px rgba(0,0,0,0.08);
      ">
        <h3 style="margin:0 0 0.5rem; font-size:1.4rem; color:#5c5145;">1980s: </h3>
        <h3 style="margin:0 0 0.5rem; font-size:1.2rem; color:#5c5145;">Redlining and Discretionary Controls</h3>
        <img src="/images/comic-1980s.png" alt="1980s housing" 
             style="width:200px; border-radius:6px; margin-bottom:0.5rem;" />
        <p style="margin:0; font-size:1rem; color:#7c6757; line-height:1.4;">
          Their children faced the same “FOR RENT” frustration in growing cities. Although formal redlining maps date earlier, the 1980s saw their legacy solidify in zoning practice: neighborhoods graded “hazardous” (often communities of color) remained problematic.
        </p>
      </div>
    </div>

    <!-- 2000s (Left) -->
    <div style="
      position:relative;
      width:50%;
      padding:1rem 2rem 1rem 0;
      box-sizing:border-box;
      text-align:right;
    ">
      <div style="
        position:absolute;
        right:-9px;
        top:1.5rem;
        width:18px;
        height:18px;
        background:#f9f4ef;
        border:3px solid #5c5145;
        border-radius:50%;
      "></div>

      <div style="
        display:inline-block;
        background:white;
        border-radius:12px;
        padding:1rem;
        box-shadow:0 4px 12px rgba(0,0,0,0.08);
      ">
        <h3 style="margin:0 0 0.5rem; font-size:1.4rem; color:#5c5145;">2000s: </h3>
        <h3 style="margin:0 0 0.5rem; font-size:1.2rem; color:#5c5145;">Inclusionary Development Policy (IDP) </h3>
        <img src="/images/comic-2000s.png" alt="2000s housing" 
             style="width:200px; border-radius:6px; margin-bottom:0.5rem;" />
        <p style="margin:0; font-size:1rem; color:#7c6757; line-height:1.4;">
          In 2000, Mayor Menino issued an executive order creating Boston’s first Inclusionary Development Policy. Any new project of ten-plus units needing zoning relief or City financing must include a share of permanently income-restricted homes.
        </p>
      </div>
    </div>

    <!-- 2020s (Right) -->
    <div style="
      position:relative;
      width:50%;
      left:50%;
      padding:1rem 0 1rem 2rem;
      box-sizing:border-box;
      text-align:left;
    ">
      <div style="
        position:absolute;
        left:-9px;
        top:1.5rem;
        width:18px;
        height:18px;
        background:#f9f4ef;
        border:3px solid #5c5145;
        border-radius:50%;
      "></div>

      <div style="
        display:inline-block;
        background:white;
        border-radius:12px;
        padding:1rem;
        box-shadow:0 4px 12px rgba(0,0,0,0.08);
      ">
        <h3 style="margin:0 0 0.5rem; font-size:1.4rem; color:#5c5145;">2020s: </h3>
        <h3 style="margin:0 0 0.5rem; font-size:1.2rem; color:#5c5145;">MBTA Communities Act & Ongoing Reforms </h3>
        <img src="/images/comic-2020s.png" alt="2020s housing" 
             style="width:200px; border-radius:6px; margin-bottom:0.5rem;" />
        <p style="margin:0; font-size:1rem; color:#7c6757; line-height:1.4;">
          In 2021, the state enacted the MBTA Communities Act, requiring the 177 municipalities served by MBTA transit (Boston itself is exempt) to zone for walkable, moderate-density multifamily housing near stations. Concurrently, Boston updated its IZ rules in late 2024, raising set-aside requirements to further boost affordability. However, today’s renters see “RENT TOO HIGH” on every listing—proof the cycle continues.
        </p>
      </div>
    </div>
  </div>
</section>





<section id="key-takeaways" style="max-width: 900px; margin: 3rem auto; padding: 0 20px;">
  <h2 style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center; ">Finding Your Affordable Home in Boston</h2>
  
  <div style="background: #f9f4ef; border-radius: 12px; padding: 2.5rem; margin-bottom: 2.5rem;">
    <h3 style="font-size: 1.8rem; color: #5c5145; margin-bottom: 1.5rem;">Your Housing Navigator</h3>
    <p style="font-size: 1.2rem; line-height: 1.6; margin-bottom: 1.8rem;">
      As a first-time homebuyer or renter earning 60-100% AMI, use these tools to navigate Boston's housing landscape:
    </p>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
      <!-- Tool 1 -->
      <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">📍 Housing Match Map</h4>
        <p style="font-size: 1.1rem;">Filter neighborhoods by:</p>
        <ul style="font-size: 1.1rem; margin-top: 1rem; padding-left: 1.5rem; line-height: 1.6;">
          <li>Your household income</li>
          <li>Family size needs</li>
          <li>Year-built preferences</li>
          <li>Transportation access</li>
        </ul>
        <p style="font-size: 1.1rem; font-style: italic; margin-top: 1.5rem;">Try dragging the timeline to see new developments!</p>
      </div>
      
      <!-- Tool 2 -->
      <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h4 style="font-size: 1.4rem; color: #d4a593; margin-bottom: 1rem;">📊 Neighborhood Insights</h4>
        <p style="font-size: 1.1rem;">Click any area to see:</p>
        <ul style="font-size: 1.1rem; margin-top: 1rem; padding-left: 1.5rem; line-height: 1.6;">
          <li>Income distribution</li>
          <li>Demographic breakdown</li>
          <li>Price-to-income ratios</li>
          <li>Upcoming zoning changes</li>
        </ul>
        <p style="font-size: 1.1rem; font-style: italic; margin-top: 1.5rem;">Search for your ideal municipality below!</p>
      </div>
    </div>
    
    <div style="margin-top: 2.5rem; background: #F8D6C5; padding: 1.5rem; border-radius: 8px;">
      <h4 style="font-size: 1.4rem; margin-top: 0; color: #5c5145;">How Zoning Reforms Help You:</h4>
      <ul style="font-size: 1.1rem; margin-bottom: 0; line-height: 1.6;">
        <li>More "missing middle" housing = more options for middle-income families</li>
        <li>Faster approvals = quicker move-in opportunities</li>
        <li>Inclusionary zoning = permanently affordable units</li>
      </ul>
    </div>
  </div>
  
  <div style="text-align: center;">
    <a href="#availability" style="  <!-- Changed from #interactive-tools to #availability -->
      display: inline-block;
      padding: 14px 28px;
      background-color: #F8D6C5;
      color: #5c5145;
      font-size: 1.3rem;
      font-weight: 600;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.3s ease;
    ">
      Explore Interactive Tools →
    </a>
  </div>
</section>






<section id="availability">
    <div class="section-header">Housing Availability Over Time</div>
    <input type="range" min="1980" max="2025" value="2025" class="form-range mb-4" id="yearSlider" />
    <div class="box text-center" style="height: 400px;">
        <div id="housingMap"></div>
    </div>
    <div class="analysis-box">
        [ Discuss trends in development—where, when, and how it impacts communities. ]
    </div>
</section>

<!-- Plotly.js and Mapbox libraries -->
<script src="https://cdn.jsdelivr.net/npm/@plotly.js/dist/plotly.min.js"></script>
<script>
    const mapboxToken = 'your_mapbox_access_token'; // Replace with your Mapbox token

    // Set up the map
    function initializeMap() {
        const map = {
            type: 'scattermapbox',
            mode: 'markers',
            marker: { size: 8, color: 'blue' },
            layout: {
                mapbox: {
                    style: 'mapbox://styles/mapbox/streets-v11', // Default map style
                    center: { lat: 42.3601, lon: -71.0589 }, // Center the map on Boston
                    zoom: 12,
                    accessToken: mapboxToken
                },
                title: 'Housing Availability in Boston Over Time',
            }
        };
        return map;
    }

    // Load CSV data and filter based on year
    async function loadData() {
        const response = await fetch('/path/to/parcel_zoning_compliance_municipal_Boston.csv'); // Adjust path
        const data = await response.text();
        return parseCSV(data);
    }

    // Parse CSV data
    function parseCSV(data) {
        const rows = data.split('\n');
        const headers = rows[0].split(',');
        const yearIndex = headers.indexOf('YEAR_BUILT');
        const latIndex = headers.indexOf('LATITUDE');
        const lonIndex = headers.indexOf('LONGITUDE');

        return rows.slice(1).map(row => {
            const columns = row.split(',');
            return {
                yearBuilt: columns[yearIndex],
                latitude: columns[latIndex],
                longitude: columns[lonIndex],
            };
        });
    }

    // Update the map based on the selected year
    function updateMap(map, year) {
        const filteredData = data.filter(d => d.yearBuilt == year);
        const latitudes = filteredData.map(d => d.latitude);
        const longitudes = filteredData.map(d => d.longitude);

        const update = {
            lat: latitudes,
            lon: longitudes,
        };
        
        Plotly.restyle(map, update);
    }

    // Setup slider interaction
    const yearSlider = document.getElementById('yearSlider');
    yearSlider.addEventListener('input', function () {
        updateMap(map, this.value);
    });

    let data;
    let map;

    loadData().then(parsedData => {
        data = parsedData;
        map = initializeMap();
        Plotly.newPlot('housingMap', map);
        updateMap(map, yearSlider.value); // Initialize the map with the current year
    });

</script>



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