<!DOCTYPE html>
@include('layouts.lang')
<head>
   @stack('linkstack-head')
   @stack('linkstack-head-end')
</head>
@php
   $appearance = isset($userinfo) ? \App\Support\Appearance::forUser($userinfo->id) : \App\Support\Appearance::defaults();
@endphp
<body class="ls-appearance" data-background-type="{{ $appearance['background_type'] }}" data-gradient-kind="{{ $appearance['gradient_kind'] }}" data-button-style="{{ $appearance['button_style'] }}" data-text-align="{{ $appearance['text_align'] }}">
   @stack('linkstack-body-start')
   <div class="container">
      <div class="row">
         <div class="column" style="margin-top: 5%">
            @stack('linkstack-content')
         </div>
      </div>
   </div>
   @stack('linkstack-body-end')
</body>
</html>
