// IDs from the stock vendor catalog; event capabilities from fw0320 handlers.
const names=['Off','Static','Breathing','Rainbow','Reactive','Starry','Ripple','Key Ripples','Raindrops','Snowflakes','Continuous Flow','Windmill','Follow Shadow','Light Wave','Scan','Rotating Circle','Waterfall','Bloom','Spinning Storm','Per-key Color']
// Rainbow, Rotating Circle and Waterfall always use the firmware palette.
export const KEY_RGB_MODES=names.map((name,id)=>({id,name,reactive:[4,7,9,12].includes(id),color:![0,3,15,16,19].includes(id),speed:![0,1,19].includes(id)}))
// Side mode 1 fades the configured RGB along the strip, which the vendor calls
// "Flowing Stream"; mode 2 cycles the whole strip through the palette and
// ignores RGB.
export const SIDE_RGB_MODES=['Off','Flowing Stream','Color Cycle','Static','Breathing','Bounce'].map((name,id)=>({id,name,reactive:false,color:![0,2].includes(id),speed:![0,3].includes(id)}))
export const RGB_SERVICE_AVAILABLE=false
