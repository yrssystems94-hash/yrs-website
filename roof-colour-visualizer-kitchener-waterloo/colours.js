// CertainTeed shingle colours — the source of truth is Summit's own catalog
// (YRS-Lead-Form/roof-colors.js), ported here so the website tool offers
// exactly the colours we actually quote and install. The photos are the same
// self-hosted product shots Summit uses, copied into this repo on purpose:
// a cross-origin image taints the canvas, which would break both the
// projection (getImageData) and the download (toDataURL).
//
// `hex` is the flat fallback tint; `image` is the real shingle course photo
// that gets projected onto the roof. Colour NAME is the source of truth.
var YRS_COLOURS = [
  {
    key: "certainteed_landmark",
    brand: "CertainTeed Landmark",
    colors: [
      { key: "atlantic_blue", name: "Atlantic Blue", hex: "#3c5a6e", image: "images/roof-colours/certainteed/atlantic_blue.jpg" },
      { key: "birchwood", name: "Birchwood", hex: "#8a7355", image: "images/roof-colours/certainteed/birchwood.jpg" },
      { key: "black_walnut", name: "Black Walnut", hex: "#3a2e26", image: "images/roof-colours/certainteed/black_walnut.jpg" },
      { key: "burnt_sienna", name: "Burnt Sienna", hex: "#7a4a36", image: "images/roof-colours/certainteed/burnt_sienna.jpg" },
      { key: "charcoal_black", name: "Charcoal Black", hex: "#292a2c", image: "images/roof-colours/certainteed/charcoal_black.jpg" },
      { key: "cobblestone_gray", name: "Cobblestone Gray", hex: "#706b62", image: "images/roof-colours/certainteed/cobblestone_gray.jpg" },
      { key: "colonial_slate", name: "Colonial Slate", hex: "#54595c", image: "images/roof-colours/certainteed/colonial_slate.jpg" },
      { key: "driftwood", name: "Driftwood", hex: "#8b8378", image: "images/roof-colours/certainteed/driftwood.jpg" },
      { key: "georgetown_gray", name: "Georgetown Gray", hex: "#6d6a63", image: "images/roof-colours/certainteed/georgetown_gray.jpg" },
      { key: "granite_gray", name: "Granite Gray", hex: "#66686a", image: "images/roof-colours/certainteed/granite_gray.jpg" },
      { key: "heather_blend", name: "Heather Blend", hex: "#7c716a", image: "images/roof-colours/certainteed/heather_blend.jpg" },
      { key: "mist_white", name: "Mist White", hex: "#d8d3c8", image: "images/roof-colours/certainteed/mist_white.jpg" },
      { key: "moire_black", name: "Moire Black", hex: "#2b2b2c", image: "images/roof-colours/certainteed/moire_black.jpg" },
      { key: "mojave_tan", name: "Mojave Tan", hex: "#a68a5f", image: "images/roof-colours/certainteed/mojave_tan.jpg" },
      { key: "mountain_timber", name: "Mountain Timber", hex: "#5c5044", image: "images/roof-colours/certainteed/mountain_timber.jpg" },
      { key: "painted_desert", name: "Painted Desert", hex: "#8f6a4a", image: "images/roof-colours/certainteed/painted_desert.jpg" },
      { key: "pewter", name: "Pewter", hex: "#5f6163", image: "images/roof-colours/certainteed/pewter.jpg" },
      { key: "resawn_shake", name: "Resawn Shake", hex: "#6b5d4d", image: "images/roof-colours/certainteed/resawn_shake.jpg" },
      { key: "sandstone", name: "Sandstone", hex: "#a08f6f", image: "images/roof-colours/certainteed/sandstone.jpg" },
      { key: "shadow_gray", name: "Shadow Gray", hex: "#55565a", image: "images/roof-colours/certainteed/shadow_gray.jpg" },
      { key: "silver_birch", name: "Silver Birch", hex: "#9a9488", image: "images/roof-colours/certainteed/silver_birch.jpg" },
      { key: "slate_blende", name: "Slate Blende", hex: "#4d5559", image: "images/roof-colours/certainteed/slate_blende.jpg" },
      { key: "spanish_tile", name: "Spanish Tile", hex: "#8a4a3a", image: "images/roof-colours/certainteed/spanish_tile.jpg" },
      { key: "sunrise_cedar", name: "Sunrise Cedar", hex: "#a3623f", image: "images/roof-colours/certainteed/sunrise_cedar.jpg" },
      { key: "terra_cotta", name: "Terra Cotta", hex: "#a15c40", image: "images/roof-colours/certainteed/terra_cotta.jpg" },
      { key: "thunderstorm_gray", name: "Thunderstorm Gray", hex: "#4b5257", image: "images/roof-colours/certainteed/thunderstorm_gray.jpg" },
      { key: "weathered_wood", name: "Weathered Wood", hex: "#8a7a63", image: "images/roof-colours/certainteed/weathered_wood.jpg" },
    ],
  },
  {
    key: "certainteed_landmark_pro",
    brand: "CertainTeed Landmark PRO",
    colors: [
      { key: "max_def_weathered_wood", name: "Max Def Weathered Wood", hex: "#8a7a63", image: "images/roof-colours/certainteed/max_def_weathered_wood.jpg" },
      { key: "max_def_moire_black", name: "Max Def Moire Black", hex: "#2b2b2c", image: "images/roof-colours/certainteed/max_def_moire_black.jpg" },
      { key: "max_def_georgetown_gray", name: "Max Def Georgetown Gray", hex: "#6d6a63", image: "images/roof-colours/certainteed/max_def_georgetown_gray.jpg" },
      { key: "max_def_colonial_slate", name: "Max Def Colonial Slate", hex: "#54595c", image: "images/roof-colours/certainteed/max_def_colonial_slate.jpg" },
      { key: "max_def_burnt_sienna", name: "Max Def Burnt Sienna", hex: "#7a4a36", image: "images/roof-colours/certainteed/max_def_burnt_sienna.jpg" },
      { key: "max_def_heather_blend", name: "Max Def Heather Blend", hex: "#7c716a", image: "images/roof-colours/certainteed/max_def_heather_blend.jpg" },
      { key: "max_def_resawn_shake", name: "Max Def Resawn Shake", hex: "#6b5d4d", image: "images/roof-colours/certainteed/max_def_resawn_shake.jpg" },
      { key: "max_def_espresso", name: "Max Def Espresso", hex: "#3d2e22", image: "images/roof-colours/certainteed/max_def_espresso.jpg" },
      { key: "max_def_red_oak", name: "Max Def Red Oak", hex: "#8a4a2e", image: "images/roof-colours/certainteed/max_def_red_oak.jpg" },
      { key: "max_def_evergreen", name: "Max Def Evergreen", hex: "#3f4f3a", image: "images/roof-colours/certainteed/max_def_evergreen.jpg" },
      { key: "max_def_driftwood", name: "Max Def Driftwood", hex: "#8b8378", image: "images/roof-colours/certainteed/max_def_driftwood.jpg" },
      { key: "max_def_pewter", name: "Max Def Pewter", hex: "#5f6163", image: "images/roof-colours/certainteed/max_def_pewter.jpg" },
      { key: "max_def_cobblestone_gray", name: "Max Def Cobblestone Gray", hex: "#706b62", image: "images/roof-colours/certainteed/max_def_cobblestone_gray.jpg" },
      { key: "max_def_coastal_blue", name: "Max Def Coastal Blue", hex: "#64798a", image: "images/roof-colours/certainteed/max_def_coastal_blue.jpg" },
      { key: "max_def_shenandoah", name: "Max Def Shenandoah", hex: "#6b5a49", image: "images/roof-colours/certainteed/max_def_shenandoah.jpg" },
    ],
  },
  {
    key: "certainteed_landmark_climateflex",
    brand: "CertainTeed Landmark ClimateFlex",
    colors: [
      { key: "weathered_wood", name: "Weathered Wood", hex: "#8a7a63", image: "images/roof-colours/certainteed/weathered_wood.jpg" },
      { key: "moire_black", name: "Moire Black", hex: "#2b2b2c", image: "images/roof-colours/certainteed/moire_black.jpg" },
      { key: "colonial_slate", name: "Colonial Slate", hex: "#54595c", image: "images/roof-colours/certainteed/colonial_slate.jpg" },
      { key: "burnt_sienna", name: "Burnt Sienna", hex: "#7a4a36", image: "images/roof-colours/certainteed/burnt_sienna.jpg" },
      { key: "heather_blend", name: "Heather Blend", hex: "#7c716a", image: "images/roof-colours/certainteed/heather_blend.jpg" },
      { key: "resawn_shake", name: "Resawn Shake", hex: "#6b5d4d", image: "images/roof-colours/certainteed/resawn_shake.jpg" },
      { key: "pewter", name: "Pewter", hex: "#5f6163", image: "images/roof-colours/certainteed/pewter.jpg" },
    ],
  },
];
