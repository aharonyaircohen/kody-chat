@extends('layouts.sidebar')

@section('content')
<div class="container-fluid content-inner py-0 appearance-studio">
  <div class="appearance-header">
    <div>
      <p class="appearance-kicker">PUBLIC PAGE</p>
      <h1>Appearance</h1>
      <p>Choose a complete style, then adjust only what you need.</p>
    </div>
    <button class="btn btn-primary" type="submit" form="appearance-form">Save appearance</button>
  </div>

  @if(session('appearance_saved'))
    <div class="alert alert-success" role="status">{{ session('appearance_saved') }}</div>
  @endif
  @if($errors->any())
    <div class="alert alert-danger" role="alert">
      @foreach($errors->all() as $error)<div>{{ $error }}</div>@endforeach
    </div>
  @endif

  <form id="appearance-form" action="{{ route('editAppearance') }}" method="post" enctype="multipart/form-data">
    @csrf
    <div class="appearance-layout">
      <div class="appearance-controls">
        <section class="appearance-panel">
          <div class="panel-heading">
            <div><h2>Presets</h2><p>Each preset changes the complete page style.</p></div>
          </div>
          <div class="preset-grid">
            <button type="button" class="preset-card is-selected" data-preset="water"><span class="preset-preview preset-water"></span><strong>Water</strong><small>Fresh teal glass</small></button>
            <button type="button" class="preset-card" data-preset="ocean"><span class="preset-preview preset-ocean"></span><strong>Deep ocean</strong><small>Dark and focused</small></button>
            <button type="button" class="preset-card" data-preset="lagoon"><span class="preset-preview preset-lagoon"></span><strong>Lagoon</strong><small>Bright turquoise</small></button>
            <button type="button" class="preset-card" data-preset="mist"><span class="preset-preview preset-mist"></span><strong>Mist</strong><small>Soft and quiet</small></button>
            <button type="button" class="preset-card" data-preset="sunset"><span class="preset-preview preset-sunset"></span><strong>Sunset</strong><small>Warm gradient</small></button>
            <button type="button" class="preset-card" data-preset="minimal"><span class="preset-preview preset-minimal"></span><strong>Minimal</strong><small>Clean white</small></button>
          </div>
        </section>

        <details class="appearance-panel" open>
          <summary><span><strong>Background</strong><small>Solid, gradient, or image</small></span></summary>
          <div class="control-grid">
            <label class="control-field full">Type
              <select name="background_type" class="form-select">
                @foreach(['gradient' => 'Gradient', 'solid' => 'Solid color', 'image' => 'Image'] as $value => $label)
                  <option value="{{ $value }}" @selected($settings['background_type'] === $value)>{{ $label }}</option>
                @endforeach
              </select>
            </label>
            <label class="control-field" data-show-for="solid">Color<input name="background_color" type="color" value="{{ $settings['background_color'] }}"></label>
            <label class="control-field" data-show-for="gradient">Start<input name="gradient_start" type="color" value="{{ $settings['gradient_start'] }}"></label>
            <label class="control-field" data-show-for="gradient">End<input name="gradient_end" type="color" value="{{ $settings['gradient_end'] }}"></label>
            <label class="control-field" data-show-for="gradient">Style
              <select name="gradient_kind" class="form-select"><option value="linear" @selected($settings['gradient_kind'] === 'linear')>Linear</option><option value="radial" @selected($settings['gradient_kind'] === 'radial')>Radial</option></select>
            </label>
            <label class="control-field full range-field" data-show-for="gradient"><span>Direction <output data-output="gradient_angle">{{ $settings['gradient_angle'] }}°</output></span><input name="gradient_angle" type="range" min="0" max="360" value="{{ $settings['gradient_angle'] }}"></label>
            <label class="control-field full" data-show-for="image">Background image<input name="background_image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="form-control"><small>Up to 4 MB. The current image stays until you upload another.</small></label>
          </div>
        </details>

        <details class="appearance-panel" open>
          <summary><span><strong>Colors and type</strong><small>Text, buttons, and font</small></span></summary>
          <div class="control-grid">
            <label class="control-field">Surface<input name="surface_color" type="color" value="{{ $settings['surface_color'] }}"></label>
            <label class="control-field">Text<input name="text_color" type="color" value="{{ $settings['text_color'] }}"></label>
            <label class="control-field">Accent<input name="accent_color" type="color" value="{{ $settings['accent_color'] }}"></label>
            <label class="control-field">Font<select name="font_family" class="form-select"><option value="sans" @selected($settings['font_family'] === 'sans')>Sans</option><option value="rounded" @selected($settings['font_family'] === 'rounded')>Rounded</option><option value="serif" @selected($settings['font_family'] === 'serif')>Serif</option></select></label>
            <label class="control-field full">Text alignment<select name="text_align" class="form-select"><option value="center" @selected($settings['text_align'] === 'center')>Center</option><option value="start" @selected($settings['text_align'] === 'start')>Start (follows language direction)</option></select></label>
            @foreach(['title_size' => ['Title size', 20, 48, 'px'], 'bio_size' => ['Bio size', 12, 24, 'px'], 'link_size' => ['Link text size', 13, 22, 'px']] as $name => [$label, $min, $max, $unit])
              <label class="control-field full range-field"><span>{{ $label }} <output data-output="{{ $name }}">{{ $settings[$name] }}{{ $unit }}</output></span><input name="{{ $name }}" type="range" min="{{ $min }}" max="{{ $max }}" value="{{ $settings[$name] }}" data-unit="{{ $unit }}"></label>
            @endforeach
          </div>
        </details>

        <details class="appearance-panel">
          <summary><span><strong>Profile image</strong><small>Size and shape</small></span></summary>
          <div class="control-grid">
            <label class="control-field full range-field"><span>Size <output data-output="avatar_size">{{ $settings['avatar_size'] }}px</output></span><input name="avatar_size" type="range" min="64" max="180" value="{{ $settings['avatar_size'] }}" data-unit="px"></label>
            <label class="control-field full">Shape<select name="avatar_shape" class="form-select"><option value="circle" @selected($settings['avatar_shape'] === 'circle')>Circle</option><option value="rounded" @selected($settings['avatar_shape'] === 'rounded')>Rounded square</option><option value="square" @selected($settings['avatar_shape'] === 'square')>Square</option></select></label>
          </div>
        </details>

        <details class="appearance-panel" open>
          <summary><span><strong>Buttons</strong><small>Shape, size, border, and shadow</small></span></summary>
          <div class="control-grid">
            <label class="control-field">Style<select name="button_style" class="form-select"><option value="glass" @selected($settings['button_style'] === 'glass')>Glass</option><option value="fill" @selected($settings['button_style'] === 'fill')>Filled</option><option value="outline" @selected($settings['button_style'] === 'outline')>Outline</option></select></label>
            <label class="control-field">Shadow<select name="button_shadow" class="form-select"><option value="none" @selected($settings['button_shadow'] === 'none')>None</option><option value="soft" @selected($settings['button_shadow'] === 'soft')>Soft</option><option value="strong" @selected($settings['button_shadow'] === 'strong')>Strong</option></select></label>
            @foreach(['button_height' => ['Height', 44, 82], 'button_radius' => ['Corner radius', 0, 40], 'button_border_width' => ['Border width', 0, 4], 'link_gap' => ['Link spacing', 6, 30], 'thumbnail_size' => ['Icon size', 20, 56], 'content_width' => ['Page width', 320, 760]] as $name => [$label, $min, $max])
              <label class="control-field full range-field"><span>{{ $label }} <output data-output="{{ $name }}">{{ $settings[$name] }}px</output></span><input name="{{ $name }}" type="range" min="{{ $min }}" max="{{ $max }}" value="{{ $settings[$name] }}" data-unit="px"></label>
            @endforeach
          </div>
        </details>
      </div>

      <aside class="appearance-preview">
        <div class="preview-toolbar"><strong>Live preview</strong><a href="{{ $pageUrl }}" target="_blank" rel="noreferrer">Open page ↗</a></div>
        <div class="preview-device"><iframe id="appearance-preview-frame" title="Public page preview" src="{{ $pageUrl }}"></iframe></div>
      </aside>
    </div>
  </form>
</div>

<style>
  .appearance-studio{max-width:1500px;margin:0 auto;padding-top:28px;padding-bottom:70px}.appearance-header{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:24px}.appearance-header h1{margin:0;color:#fff;font-size:34px}.appearance-header p{margin:5px 0 0;color:#c8cedd}.appearance-kicker{font-size:11px!important;font-weight:700;letter-spacing:.12em;color:#6fe0df!important}.appearance-layout{display:grid;grid-template-columns:minmax(520px,1fr) minmax(340px,.82fr);gap:24px;align-items:start}.appearance-controls{display:grid;gap:16px}.appearance-panel{border:1px solid #e1e7eb;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(21,50,61,.05);overflow:hidden}.appearance-panel>.panel-heading,.appearance-panel>summary{padding:20px 22px}.appearance-panel summary{display:flex;cursor:pointer;list-style:none}.appearance-panel summary::-webkit-details-marker{display:none}.appearance-panel summary span{display:grid;gap:4px}.appearance-panel summary small,.panel-heading p{color:#788493;font-size:12px}.appearance-panel h2,.appearance-panel summary strong{margin:0;font-size:16px}.panel-heading p{margin:4px 0 0}.preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 22px 22px}.preset-card{display:grid;gap:5px;padding:8px;border:1px solid #dce4e8;border-radius:12px;background:#fff;text-align:start}.preset-card:hover,.preset-card.is-selected{border-color:#168998;box-shadow:0 0 0 2px rgba(22,137,152,.12)}.preset-card strong{font-size:12px}.preset-card small{color:#7c8791;font-size:10px}.preset-preview{height:62px;border-radius:8px}.preset-water{background:linear-gradient(145deg,#d9fbf7,#3eb6c5)}.preset-ocean{background:linear-gradient(150deg,#071d2a,#0d7888)}.preset-lagoon{background:radial-gradient(circle,#e5fffb,#12bfc0)}.preset-mist{background:linear-gradient(145deg,#f7fbfb,#c8e1e3)}.preset-sunset{background:linear-gradient(145deg,#ffe6c9,#ec7f72)}.preset-minimal{background:#f8fafb;border:1px solid #e2e7ea}.control-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 22px 22px}.control-field{display:grid;gap:7px;color:#425061;font-size:12px;font-weight:650}.control-field.full{grid-column:1/-1}.control-field input[type=color]{width:100%;height:42px;padding:4px;border:1px solid #d7e0e5;border-radius:9px;background:#fff}.control-field small{font-weight:400;color:#7a8692}.range-field span{display:flex;justify-content:space-between}.range-field output{color:#168998}.range-field input{accent-color:#168998}.appearance-preview{position:sticky;top:20px}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:0 6px;color:#fff}.preview-toolbar a{color:#6fe0df;font-size:12px}.preview-device{height:720px;padding:10px;border-radius:28px;background:#17262d;box-shadow:0 24px 60px rgba(15,40,49,.2)}.preview-device iframe{width:100%;height:100%;border:0;border-radius:20px;background:#fff}@media(max-width:1050px){.appearance-layout{grid-template-columns:1fr}.appearance-preview{position:static}.preview-device{height:650px}}@media(max-width:620px){.appearance-header{align-items:start;flex-direction:column}.appearance-header .btn{width:100%}.preset-grid{grid-template-columns:repeat(2,1fr)}.control-grid{grid-template-columns:1fr}.control-field{grid-column:1/-1}.appearance-panel>.panel-heading,.appearance-panel>summary{padding-inline:16px}.preset-grid,.control-grid{padding-inline:16px}}
</style>

<script>
(() => {
  const form = document.querySelector('#appearance-form');
  const frame = document.querySelector('#appearance-preview-frame');
  const presets = {
    water:{background_type:'gradient',gradient_kind:'linear',gradient_start:'#d9fbf7',gradient_end:'#3eb6c5',gradient_angle:145,surface_color:'#ffffff',text_color:'#123b47',accent_color:'#087f8c',font_family:'sans',button_style:'glass',button_shadow:'soft',button_radius:18,button_height:60,link_gap:14},
    ocean:{background_type:'gradient',gradient_kind:'linear',gradient_start:'#071d2a',gradient_end:'#0d7888',gradient_angle:150,surface_color:'#123744',text_color:'#f2ffff',accent_color:'#55e1dc',font_family:'sans',button_style:'glass',button_shadow:'strong',button_radius:18,button_height:62,link_gap:14},
    lagoon:{background_type:'gradient',gradient_kind:'radial',gradient_start:'#e5fffb',gradient_end:'#12bfc0',gradient_angle:90,surface_color:'#ffffff',text_color:'#073f48',accent_color:'#007f86',font_family:'rounded',button_style:'fill',button_shadow:'soft',button_radius:28,button_height:60,link_gap:12},
    mist:{background_type:'gradient',gradient_kind:'linear',gradient_start:'#f7fbfb',gradient_end:'#c8e1e3',gradient_angle:145,surface_color:'#ffffff',text_color:'#334b52',accent_color:'#4d8992',font_family:'serif',button_style:'outline',button_shadow:'none',button_radius:10,button_height:56,link_gap:12},
    sunset:{background_type:'gradient',gradient_kind:'linear',gradient_start:'#ffe6c9',gradient_end:'#ec7f72',gradient_angle:145,surface_color:'#fff9f3',text_color:'#542e32',accent_color:'#b84154',font_family:'rounded',button_style:'glass',button_shadow:'soft',button_radius:20,button_height:60,link_gap:14},
    minimal:{background_type:'solid',background_color:'#f8fafb',gradient_kind:'linear',gradient_start:'#ffffff',gradient_end:'#eef2f4',gradient_angle:145,surface_color:'#ffffff',text_color:'#20272b',accent_color:'#20272b',font_family:'sans',button_style:'outline',button_shadow:'none',button_radius:8,button_height:54,link_gap:10}
  };
  const fontStacks={sans:'"Open Sans","Segoe UI",Arial,sans-serif',rounded:'Nunito,"Arial Rounded MT Bold",system-ui,sans-serif',serif:'Georgia,Cambria,"Times New Roman",serif'};
  const shadows={none:'none',soft:'0 10px 30px rgba(4,67,78,.12)',strong:'0 16px 42px rgba(4,53,66,.26)'};
  const avatarRadii={circle:'50%',rounded:'22%',square:'0'};
  const value = name => form.elements[name]?.value;
  const set = (name,next) => { if(form.elements[name]) form.elements[name].value=next; };

  function background(){
    if(value('background_type')==='solid') return value('background_color');
    if(value('background_type')==='image') return 'linear-gradient(rgba(4,36,43,.22),rgba(4,36,43,.22)), var(--ls-preview-image, #b8dfe1) center / cover fixed';
    return value('gradient_kind')==='radial' ? `radial-gradient(circle, ${value('gradient_start')}, ${value('gradient_end')})` : `linear-gradient(${value('gradient_angle')}deg, ${value('gradient_start')}, ${value('gradient_end')})`;
  }
  function updateVisibility(){ document.querySelectorAll('[data-show-for]').forEach(el=>el.hidden=el.dataset.showFor!==value('background_type')); }
  function updateOutputs(){ form.querySelectorAll('input[type=range]').forEach(input=>{const output=form.querySelector(`[data-output="${input.name}"]`);if(output)output.value=`${input.value}${input.dataset.unit|| (input.name==='gradient_angle'?'°':'')}`;}); }
  function updatePreview(){
    updateVisibility(); updateOutputs();
    const doc=frame.contentDocument; if(!doc?.body)return;
    const root=doc.documentElement.style;
    const vars={
      '--ls-background':background(),'--ls-surface':value('surface_color'),'--ls-text':value('text_color'),'--ls-accent':value('accent_color'),'--ls-font':fontStacks[value('font_family')],
      '--ls-content-width':`${value('content_width')}px`,'--ls-avatar-size':`${value('avatar_size')}px`,'--ls-avatar-radius':avatarRadii[value('avatar_shape')],'--ls-title-size':`${value('title_size')}px`,'--ls-bio-size':`${value('bio_size')}px`,'--ls-link-size':`${value('link_size')}px`,'--ls-button-height':`${value('button_height')}px`,'--ls-button-radius':`${value('button_radius')}px`,'--ls-button-border':`${value('button_border_width')}px`,'--ls-button-shadow':shadows[value('button_shadow')],'--ls-link-gap':`${value('link_gap')}px`,'--ls-thumbnail-size':`${value('thumbnail_size')}px`
    };
    Object.entries(vars).forEach(([key,next])=>root.setProperty(key,next));
    doc.body.dataset.backgroundType=value('background_type'); doc.body.dataset.gradientKind=value('gradient_kind'); doc.body.dataset.buttonStyle=value('button_style'); doc.body.dataset.textAlign=value('text_align');
  }
  form.addEventListener('input',updatePreview); form.addEventListener('change',updatePreview); frame.addEventListener('load',updatePreview);
  form.elements.background_image?.addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;const doc=frame.contentDocument;doc?.documentElement.style.setProperty('--ls-preview-image',`url('${URL.createObjectURL(file)}')`);updatePreview();});
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{Object.entries(presets[button.dataset.preset]).forEach(([name,next])=>set(name,next));document.querySelectorAll('[data-preset]').forEach(item=>item.classList.toggle('is-selected',item===button));updatePreview();}));
  updateVisibility(); updateOutputs();
})();
</script>
@endsection
