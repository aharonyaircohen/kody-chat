@php
    $profileText = isset($userinfo) ? trim(($userinfo->name ?? '') . ' ' . strip_tags($userinfo->littlelink_description ?? '')) : '';
    $profileIsRtl = $profileText !== '' && \App\Support\Appearance::directionForText($profileText) === 'rtl';
@endphp
<html lang="{{ $profileIsRtl ? 'he' : config('app.locale') }}" dir="{{ $profileIsRtl ? 'rtl' : 'ltr' }}">
