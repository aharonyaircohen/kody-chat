@php
// Theme Config
if (!function_exists('theme')) {
  function theme($key){
$key = trim($key);
$file = base_path('themes/' . $GLOBALS['themeName'] . '/config.php');
  if (file_exists($file)) {
    $config = include $file;
  if (isset($config[$key])) {
    return $config[$key];
}}
return null;}
}

// Theme Custom Asset
if (!function_exists('themeAsset')) {
function themeAsset($path){
$path = url('themes/' . $GLOBALS['themeName'] . '/extra/custom-assets/' . $path);
return $path;}
}

$customBackgroundExists = false;
@endphp

@foreach($information as $info) @php $GLOBALS['themeName'] = $info->theme; @endphp @endforeach

@if(theme('allow_custom_background') != "false")
@php
$customBackgroundFile = findBackground($userinfo->id);
$customBackgroundPath = base_path('assets/img/background-img/'.$customBackgroundFile);
$customBackgroundURL = url('assets/img/background-img/'.$customBackgroundFile);
$customBackgroundExists = file_exists($customBackgroundPath)
@endphp

@if($customBackgroundExists == true)
<style>
  body {
    background-image: url('{{$customBackgroundURL}}') !important;
    background-size: cover !important;
    background-attachment: fixed !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
  }
</style>
@endif
@endif

@push('linkstack-head-end')
@if(theme('enable_custom_code') == "true" and theme('enable_custom_head') == "true" and env('ALLOW_CUSTOM_CODE_IN_THEMES') == 'true')@include($GLOBALS['themeName'] . '.extra.custom-head')@endif
@if($info->theme != '' and $info->theme != 'default')

  <!-- LinkStack Theme: "{{$info->theme}}" -->

  <!-- Theme details: -->
  <meta name="designer" href="{{ url('') . "/theme/@" . $littlelink_name}}" content="{{ url('') . "/theme/@" . $littlelink_name}}">

  <link rel="stylesheet" href="themes/{{$info->theme}}/share.button.css">
  @if(theme('use_default_buttons') == "true")
  <link rel="stylesheet" href="{{ asset('assets/linkstack/css/brands.css') }}">
  @else
  <link rel="stylesheet" href="themes/{{$info->theme}}/brands.css">
  @endif
  <link rel="stylesheet" href="themes/{{$info->theme}}/skeleton-auto.css">
@if(file_exists(base_path('themes/' . $info->theme . '/animations.css')))
  <link rel="stylesheet" href="<?php echo asset('themes/' . $info->theme . '/animations.css') ?>">
@else
  <link rel="stylesheet" href="{{ asset('assets/linkstack/css/animations.css') }}">
@endif

@else
  <link rel="stylesheet" href="{{ asset('assets/linkstack/css/share.button.css') }}">
  <link rel="stylesheet" href="{{ asset('assets/linkstack/css/animations.css') }}">
  <link rel="stylesheet" href="{{ asset('assets/linkstack/css/brands.css') }}">
  <link rel="stylesheet" href="{{ asset('assets/linkstack/css/skeleton-auto.css') }}">
@endif
<style>.container{word-break: break-word;}</style>
@endpush

@push('linkstack-body-start')
@if(theme('enable_custom_code') == "true" and theme('enable_custom_body') == "true" and env('ALLOW_CUSTOM_CODE_IN_THEMES') == 'true')@include($GLOBALS['themeName'] . '.extra.custom-body')@endif

@if($info->theme != '' and $info->theme != 'default')
    <!-- Enables parallax background animations -->
    <div class="background-container">
    <section class="parallax-background">
      <div id="object1" class="object1"></div>
      <div id="object2" class="object2"></div>
      <div id="object3" class="object3"></div>
      <div id="object4" class="object4"></div>
      <div id="object5" class="object5"></div>
      <div id="object6" class="object6"></div>
      <div id="object7" class="object7"></div>
      <div id="object8" class="object8"></div>
      <div id="object9" class="object9"></div>
      <div id="object10" class="object10"></div>
      <div id="object11" class="object11"></div>
      <div id="object12" class="object12"></div>
    </section>
    </div>
    <!-- End of parallax background animations -->
@endif
@endpush

@push('linkstack-body-end')
@if(theme('enable_custom_code') == "true" and theme('enable_custom_body_end') == "true" and env('ALLOW_CUSTOM_CODE_IN_THEMES') == 'true')@include($GLOBALS['themeName'] . '.extra.custom-body-end')@endif
@endpush
@include('linkstack.modules.dynamic-contrast')

@php
  $appearance = \App\Support\Appearance::forUser($userinfo->id);
  $appearanceBackground = $appearance['background_color'];
  if ($appearance['background_type'] === 'gradient') {
    $appearanceBackground = $appearance['gradient_kind'] === 'radial'
      ? "radial-gradient(circle, {$appearance['gradient_start']}, {$appearance['gradient_end']})"
      : "linear-gradient({$appearance['gradient_angle']}deg, {$appearance['gradient_start']}, {$appearance['gradient_end']})";
  } elseif ($appearance['background_type'] === 'image' && $customBackgroundExists) {
    $appearanceBackground = "linear-gradient(rgba(4, 36, 43, .22), rgba(4, 36, 43, .22)), url('{$customBackgroundURL}') center / cover fixed";
  }
@endphp

<style id="linkstack-appearance">
  :root {
    --ls-background: {!! $appearanceBackground !!};
    --ls-surface: {{ $appearance['surface_color'] }};
    --ls-text: {{ $appearance['text_color'] }};
    --ls-accent: {{ $appearance['accent_color'] }};
    --ls-content-width: {{ $appearance['content_width'] }}px;
    --ls-avatar-size: {{ $appearance['avatar_size'] }}px;
    --ls-avatar-radius: {{ \App\Support\Appearance::avatarRadius($appearance['avatar_shape']) }};
    --ls-title-size: {{ $appearance['title_size'] }}px;
    --ls-bio-size: {{ $appearance['bio_size'] }}px;
    --ls-link-size: {{ $appearance['link_size'] }}px;
    --ls-button-height: {{ $appearance['button_height'] }}px;
    --ls-button-radius: {{ $appearance['button_radius'] }}px;
    --ls-button-border: {{ $appearance['button_border_width'] }}px;
    --ls-button-shadow: {{ \App\Support\Appearance::shadow($appearance['button_shadow']) }};
    --ls-link-gap: {{ $appearance['link_gap'] }}px;
    --ls-thumbnail-size: {{ $appearance['thumbnail_size'] }}px;
    --ls-font: {!! \App\Support\Appearance::fontStack($appearance['font_family']) !!};
  }

  body.ls-appearance {
    min-height: 100vh;
    color: var(--ls-text) !important;
    background: var(--ls-background) !important;
    background-attachment: fixed !important;
    font-family: var(--ls-font) !important;
  }

  body.ls-appearance::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(circle at 12% 18%, rgba(255,255,255,.55), transparent 30%),
      radial-gradient(circle at 88% 84%, rgba(7,128,140,.17), transparent 36%);
  }

  body.ls-appearance .container { max-width: var(--ls-content-width) !important; }
  body.ls-appearance #avatar {
    width: var(--ls-avatar-size) !important;
    height: var(--ls-avatar-size) !important;
    min-width: 0 !important;
    border-radius: var(--ls-avatar-radius) !important;
    border: 3px solid color-mix(in srgb, var(--ls-surface) 72%, transparent);
    box-shadow: 0 12px 38px rgba(4, 64, 74, .17);
  }
  body.ls-appearance h1 { color: var(--ls-text) !important; font-size: var(--ls-title-size) !important; line-height: 1.18 !important; }
  body.ls-appearance .description-parent,
  body.ls-appearance .description-parent p { color: var(--ls-text) !important; font-size: var(--ls-bio-size) !important; line-height: 1.55 !important; }
  body.ls-appearance .button-entrance { margin-bottom: var(--ls-link-gap) !important; }
  body.ls-appearance .button {
    min-height: var(--ls-button-height) !important;
    height: auto !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 10px 18px !important;
    border-width: var(--ls-button-border) !important;
    border-style: solid !important;
    border-radius: var(--ls-button-radius) !important;
    border-color: color-mix(in srgb, var(--ls-accent) 38%, transparent) !important;
    box-shadow: var(--ls-button-shadow) !important;
    color: var(--ls-text) !important;
    font-family: var(--ls-font) !important;
    font-size: var(--ls-link-size) !important;
    line-height: 1.35 !important;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease !important;
  }
  body.ls-appearance .button:hover { transform: translateY(-2px); border-color: var(--ls-accent) !important; }
  body.ls-appearance[data-button-style="fill"] .button { background: var(--ls-accent) !important; color: #fff !important; }
  body.ls-appearance[data-button-style="outline"] .button { background: transparent !important; color: var(--ls-text) !important; }
  body.ls-appearance[data-button-style="glass"] .button {
    background: color-mix(in srgb, var(--ls-surface) 78%, transparent) !important;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  body.ls-appearance .button .icon {
    width: var(--ls-thumbnail-size) !important;
    height: var(--ls-thumbnail-size) !important;
    object-fit: contain;
  }
  body.ls-appearance[data-text-align="start"] h1,
  body.ls-appearance[data-text-align="start"] .description-parent { text-align: start !important; }
  body.ls-appearance[data-text-align="start"] .button { justify-content: flex-start !important; text-align: start !important; }
  html[dir="rtl"] body.ls-appearance .button { direction: rtl; }
  html[dir="rtl"] body.ls-appearance .button .icon { float: none !important; margin-inline: 0 12px !important; }
  html[dir="ltr"] body.ls-appearance .button .icon { float: none !important; margin-inline: 0 12px !important; }

  @media (max-width: 640px) {
    body.ls-appearance .container { width: min(91%, var(--ls-content-width)) !important; }
    body.ls-appearance .column { margin-top: 7% !important; }
  }
</style>
