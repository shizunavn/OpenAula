#include "../service/native/rhythm_core.h"
#include <cassert>
#include <iostream>
#include <set>
#include <chrono>
#include <numeric>
using namespace rhythm;
int main() {
  Config removed;removed.keyMode=430;assert(!valid(removed));
  Engine rejected;bool failed=false;try{rejected.configure(removed);}catch(const std::exception&){failed=true;}assert(failed);
  assert(std::set<uint8_t>(positions.begin(),positions.end()).size()==68);
  assert(positions[62]==71); // AltRight is a real LED, not a layout placeholder.
  for(const auto& groups:bloomPatterns){std::set<uint8_t> seen;for(const auto& g:groups)seen.insert(g.begin(),g.end());for(auto p:positions)assert(seen.count(p));}
  float samples[]={-1,.5f,.2f};assert(std::abs(envelope(samples,3)-.6)<.00001);assert(envelope(nullptr,0)==0);
  const float stereo[]={.5f,-.25f},surround[]={1,.5f,.25f,0,-.25f,-.5f,-1,0};
  assert(monoSample(reinterpret_cast<const uint8_t*>(stereo),2,4,true)==.125);
  assert(monoSample(reinterpret_cast<const uint8_t*>(surround),8,4,true)==0);
  const int16_t pcm16[]={16384,-8192};assert(monoSample(reinterpret_cast<const uint8_t*>(pcm16),2,2,false)==.125);
  const uint8_t pcm24[]={0,0,0x40,0,0,0xe0};assert(monoSample(pcm24,2,3,false)==.125);
  const int32_t pcm32[]={1073741824,-536870912};assert(monoSample(reinterpret_cast<const uint8_t*>(pcm32),2,4,false)==.125);
  const float invalid[]={NAN,.5f};assert(monoSample(reinterpret_cast<const uint8_t*>(invalid),2,4,true)==.25);
  std::array<float,256> silence{};for(int window=0;window<3;++window)for(auto x:fft(silence,window,1050))assert(x==0&&std::isfinite(x));
  std::array<float,256> sine{};for(int i=0;i<256;++i)sine[i]=float(.001*std::sin(2*pi*8*i/256));
  for(int window=0;window<3;++window){auto bins=fft(sine,window,1050);assert(bins[8]>bins[2]&&bins[8]>bins[24]);for(auto x:bins)assert(std::isfinite(x)&&x>=0&&x<=1);}
  for(int frequency=1;frequency<64;++frequency){for(int i=0;i<256;++i)sine[i]=float(.001*std::sin(2*pi*frequency*i/256));auto bins=fft(sine,0,1050);assert(std::max_element(bins.begin(),bins.end())-bins.begin()==frequency);}
  sine.fill(0);sine[128]=1;for(auto x:fft(sine,0,1050))assert(std::isfinite(x)&&x>0);
  Frame rainbow;for(int i=0;i<68;++i)rainbow.keys[i]={uint8_t(i*3),uint8_t(i*7),uint8_t(i*13)};rainbow.keys[0]={};
  auto encoded=encode(rainbow);assert(encoded.packets.size()<=4);assert(encoded.keys[0]==Color{});
  std::vector<uint8_t> body;for(size_t i=0;i<encoded.packets.size();++i){const auto& p=encoded.packets[i];assert(p[0]==9&&p[1]==8&&p[2]==1&&p[4]==encoded.packets.size()&&p[5]==i&&p[6]<=56);assert((std::accumulate(p.begin(),p.end(),0)&255)==255);body.insert(body.end(),p.begin()+7,p.begin()+7+p[6]);}
  assert(body.size()<=196);std::set<int> transmitted;
  for(size_t i=0;i<body.size();){assert(body[i+3]>0);for(size_t j=0;j<body[i+3];++j)assert(transmitted.insert(body[i+4+j]).second);i+=4+body[i+3];assert(i<=body.size());}
  assert(transmitted.size()==68);assert(transmitted.count(71));
  for(int mode:{169,170,171,172,173,180,428}) {
    Engine engine;Config config;config.keyMode=mode;config.palette=0;config.releaseMs=80;engine.configure(config);
    Audio audio;audio.envelope=.8;audio.samples=sine;audio.sequence=1;audio.generation=1;audio.receivedMs=1000;
    auto frame=engine.render(audio,1000);assert(frame.level>.9);
    auto packets=encode(frame).packets;assert(!packets.empty());if(mode==171)assert(packets.size()==1&&packets[0][2]==2);
    for(const auto& p:packets)assert((std::accumulate(p.begin(),p.end(),0)&255)==255);
    audio.envelope=0;audio.samples={};audio.sequence++;audio.receivedMs=1017;
    assert(engine.render(audio,1017).level<frame.level);
    for(double t=1050;t<2200;t+=17){audio.receivedMs=t;audio.sequence++;frame=engine.render(audio,t);}
    assert(frame.level==0);for(auto c:frame.keys)assert(c==Color{});
    audio.envelope=1;audio.receivedMs=2200;audio.sequence++;assert(engine.render(audio,2200).level>.9);
    audio={};audio.generation=2;frame=engine.render(audio,2217);assert(frame.level==0);for(auto c:frame.keys)assert(c==Color{});
  }
  Engine stream;Config c;c.keyMode=172;c.palette=0;c.releaseMs=0;stream.configure(c);
  Audio a;a.sequence=1;a.receivedMs=1000;a.envelope=1;auto f=stream.render(a,1000);assert(f.keys[0]!=Color{});assert(f.keys[1]==Color{});
  a.sequence++;a.receivedMs=1030;a.envelope=0;f=stream.render(a,1030);assert(f.keys[0]==Color{});assert(f.keys[1]!=Color{});
  for(int mode:{500,501,502,503}){c.sideMode=mode;stream.configure(c);a.sequence++;a.envelope=.7;a.receivedMs=1060;f=stream.render(a,1060);const auto packets=encodeSide(f,mode);if(mode==500)assert(packets.empty());for(const auto& p:packets){assert(p[1]==14);assert((std::accumulate(p.begin(),p.end(),0)&255)==255);}}
  {
    // HERO84: same palette groups, 16 extra positions joined to their HERO68 source key's group.
    auto wide=encode(rainbow,true);assert(wide.packets.size()<=4);assert(wide.keys==encoded.keys);
    std::vector<uint8_t> wideBody;for(const auto& p:wide.packets)wideBody.insert(wideBody.end(),p.begin()+7,p.begin()+7+p[6]);
    std::set<int> wideSeen;size_t groupCount=0;for(size_t i=0;i<wideBody.size();){const size_t n=wideBody[i+3];++groupCount;for(size_t k=0;k<n;++k)assert(wideSeen.insert(wideBody[i+4+k]).second);i+=4+n;}
    assert(wideSeen.size()==84&&groupCount<=32&&wideBody.size()<=255);
    for(auto extra:hero84Extras)assert(wideSeen.count(extra[0])&&wideSeen.count(extra[1]));
    const auto narrow=encode(rainbow,false);std::vector<uint8_t> narrowBody;for(const auto& p:narrow.packets)narrowBody.insert(narrowBody.end(),p.begin()+7,p.begin()+7+p[6]);
    std::set<int> narrowSeen;for(size_t i=0;i<narrowBody.size();){const size_t n=narrowBody[i+3];for(size_t k=0;k<n;++k)narrowSeen.insert(narrowBody[i+4+k]);i+=4+n;}
    assert(narrowSeen.size()==68);for(auto extra:hero84Extras)assert(!narrowSeen.count(extra[0]));
  }
  {
    // Verify WIN 68 HE MAX (XSYD) custom batch decoding and 0x18/0x2A encoding.
    const auto decoded = decodeCustomBatch(encoded.packets);
    assert(decoded.keys == encoded.keys);
    std::array<Color, 68> prev{};
    bool primed = false;
    const auto xsydFirst = encodeXsyd(decoded, prev, primed);
    assert(primed);
    assert(xsydFirst.packets.size() == 6); // 1x 0x18 mode 0x15 + 5x 0x2A batches
    assert(xsydFirst.packets[0][0] == 0x5c && xsydFirst.packets[0][2] == 0x18);
    for (size_t i = 1; i < 6; ++i) {
      assert(xsydFirst.packets[i][0] == 0x5c && xsydFirst.packets[i][1] == 0x39 && xsydFirst.packets[i][2] == 0x2a);
    }
    const auto xsydUnchanged = encodeXsyd(decoded, prev, primed);
    assert(xsydUnchanged.packets.empty());
    const auto restore = xsydOnboardRestoreReport();
    assert(restore[0] == 0x5c && restore[2] == 0x18);
  }
  {
    // OpenRGB-derived modes: 429 Spectrum Bars, 432 Audio Marquee, 434 Radial Chase and
    // side 505 (peak-hold) / 506 (far-end). Same silence and generation guarantees as above.
    for(int mode:{429,432,434}) {
      Engine engine;Config config;config.keyMode=mode;config.palette=0;config.releaseMs=80;engine.configure(config);
      // Keep feeding the 256-sample window like a live capture; `sine` is a full second of
      // synthetic audio, so only the envelope (not the sample history) may change.
      Audio audio;audio.envelope=.8;audio.samples=sine;audio.sequence=1;audio.generation=1;audio.receivedMs=1000;
      auto frame=engine.render(audio,1000);assert(frame.level>.9);
      auto packets=encode(frame).packets;assert(!packets.empty());
      for(const auto& p:packets)assert((std::accumulate(p.begin(),p.end(),0)&255)==255);
      audio.envelope=0;audio.samples={};audio.sequence++;audio.receivedMs=1017;
      assert(engine.render(audio,1017).level<frame.level);
      for(double t=1050;t<2200;t+=17){audio.receivedMs=t;audio.sequence++;frame=engine.render(audio,t);}
      assert(frame.level==0);for(auto c:frame.keys)assert(c==Color{});
      audio.envelope=1;audio.receivedMs=2200;audio.sequence++;assert(engine.render(audio,2200).level>.9);
      audio={};audio.generation=2;frame=engine.render(audio,2217);assert(frame.level==0);for(auto c:frame.keys)assert(c==Color{});
    }
    // Spectrum Bars must light something for a tone that lands outside the first band,
    // must light the top number row (keys 0..14) when band energy is high, and
    // silence must leave every band dark (log bands must not create DC energy).
    {
      Engine specBars;Config sbCfg;sbCfg.keyMode=429;sbCfg.palette=0;sbCfg.releaseMs=80;specBars.configure(sbCfg);
      Audio loud;loud.envelope=1.0;loud.samples=sine;loud.sequence=1;loud.generation=1;loud.receivedMs=1000;
      auto sbFrame=specBars.render(loud,1000);
      bool topRowLit=false;
      for(int k=0;k<15;++k)if(sbFrame.keys[k]!=Color{})topRowLit=true;
      assert(topRowLit);
    }
    for(int frequency:{3,17,40}) {
      std::array<float,256> tone{};for(int i=0;i<256;++i)tone[i]=float(.001*std::sin(2*pi*frequency*i/256));
      auto bands=logBands(tone,0,35*30);assert(*std::max_element(bands.begin(),bands.end())>0);for(auto b:bands)assert(std::isfinite(b)&&b>=0&&b<=1);
      std::vector<int> lit;for(int b=0;b<16;++b)if(bands[b]>.01)lit.push_back(b);
      assert(!lit.empty());const int expected=std::clamp(int(std::lround(std::log(double(frequency))/std::log(64.)*16)),0,15);
      assert(std::find(lit.begin(),lit.end(),expected)!=lit.end());
    }
    for(auto b:logBands(silence,0,1050))assert(b==0);for(auto b:logBands(silence,2,1050))assert(b==0);
    // An idle engine must never emit residual pixels in the new modes.
    for(int mode:{429,432,434}) {
      Engine idle;Config config;config.keyMode=mode;idle.configure(config);
      Audio quiet;quiet.generation=1;auto f=idle.render(quiet,1000);assert(f.level==0);
      for(auto c:f.keys)assert(c==Color{});
    }
    // Marquee and Radial Chase must stay black at level 0 and scale lit keys with audio level.
    for(int mode:{432,434}) {
      Engine eng;Config cfg;cfg.keyMode=mode;cfg.palette=0;cfg.sensitivity=1;cfg.releaseMs=0;eng.configure(cfg);
      Audio idle;idle.generation=1;auto idleFrame=eng.render(idle,5000);
      assert(idleFrame.level==0);for(auto k:idleFrame.keys)assert(k==Color{});
      Audio low;low.generation=1;low.sequence=1;low.receivedMs=5016;low.envelope=.25;
      auto lowFrame=eng.render(low,5016);
      int lowLit=0;for(auto k:lowFrame.keys)if(k!=Color{})++lowLit;
      Audio high;high.generation=1;high.sequence=2;high.receivedMs=5032;high.envelope=.95;
      auto highFrame=eng.render(high,5032);
      int highLit=0;for(auto k:highFrame.keys)if(k!=Color{})++highLit;
      assert(lowLit>0&&highLit>lowLit);
    }
    // Peak-hold side meter: rises to the attack level, decays when the level falls, and
    // side 506 is the far-end mirror of 501.
    Engine side;Config c;c.keyMode=171;c.sideMode=501;c.palette=0;c.releaseMs=80;c.sensitivity=2;side.configure(c);
    Audio a;a.sequence=1;a.receivedMs=1000;a.envelope=.4;auto rising=side.render(a,1000);
    assert(rising.level==.8);assert(rising.side[0]!=Color{}&&rising.side[17]==Color{});
    c.sideMode=505;side.configure(c);a.sequence++;a.receivedMs=1017;a.envelope=0;auto holding=side.render(a,1017);
    assert(holding.level<.8);int held=0;for(auto s:holding.side)if(s!=Color{})++held;assert(held>0);
    c.sideMode=506;side.configure(c);a.sequence++;a.receivedMs=1100;a.envelope=.9;auto far=side.render(a,1100);
    assert(far.level==1);assert(far.side[0]!=Color{}&&far.side[17]!=Color{});
    c.sideMode=504;side.configure(c);a.sequence++;a.receivedMs=1117;a.envelope=.9;auto looped=side.render(a,1117);
    for(auto s:looped.side)assert(s!=Color{});
    for(int mode:{504,505,506}){c.sideMode=mode;side.configure(c);a.sequence++;auto f=side.render(a,1200);for(const auto& p:encodeSide(f,mode)){assert(p[1]==14);assert((std::accumulate(p.begin(),p.end(),0)&255)==255);}}
  }
  const auto begin=std::chrono::steady_clock::now();for(int i=0;i<1000;++i)encode(rainbow);
  const double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count()/1000;
  std::cout<<"Native rhythm tests passed; worst-palette encode mean "<<ms<<" ms\n";
}