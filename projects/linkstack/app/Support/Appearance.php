<?php

namespace App\Support;

use App\Models\UserData;

class Appearance
{
    public static function defaults(): array
    {
        return [
            'enabled' => true,
            'background_type' => 'gradient',
            'background_color' => '#e8fbfa',
            'gradient_start' => '#d9fbf7',
            'gradient_end' => '#3eb6c5',
            'gradient_angle' => 145,
            'gradient_kind' => 'linear',
            'surface_color' => '#ffffff',
            'text_color' => '#123b47',
            'accent_color' => '#087f8c',
            'font_family' => 'sans',
            'text_align' => 'center',
            'avatar_size' => 112,
            'avatar_shape' => 'circle',
            'title_size' => 32,
            'bio_size' => 17,
            'link_size' => 17,
            'content_width' => 600,
            'button_height' => 60,
            'button_radius' => 18,
            'button_border_width' => 1,
            'button_style' => 'glass',
            'button_shadow' => 'soft',
            'link_gap' => 14,
            'thumbnail_size' => 30,
        ];
    }

    public static function forUser(int $userId): array
    {
        $saved = UserData::getData($userId, 'appearance');
        return self::normalize(is_array($saved) ? $saved : []);
    }

    public static function normalize(array $input): array
    {
        $settings = array_merge(self::defaults(), $input);

        $settings['enabled'] = filter_var($settings['enabled'], FILTER_VALIDATE_BOOLEAN);
        foreach (['background_color', 'gradient_start', 'gradient_end', 'surface_color', 'text_color', 'accent_color'] as $key) {
            if (!preg_match('/^#[0-9a-fA-F]{6}$/', (string) $settings[$key])) {
                $settings[$key] = self::defaults()[$key];
            }
        }

        $settings['background_type'] = self::choice($settings['background_type'], ['solid', 'gradient', 'image'], 'gradient');
        $settings['gradient_kind'] = self::choice($settings['gradient_kind'], ['linear', 'radial'], 'linear');
        $settings['font_family'] = self::choice($settings['font_family'], ['sans', 'serif', 'rounded'], 'sans');
        $settings['text_align'] = self::choice($settings['text_align'], ['start', 'center'], 'center');
        $settings['avatar_shape'] = self::choice($settings['avatar_shape'], ['circle', 'rounded', 'square'], 'circle');
        $settings['button_style'] = self::choice($settings['button_style'], ['fill', 'outline', 'glass'], 'glass');
        $settings['button_shadow'] = self::choice($settings['button_shadow'], ['none', 'soft', 'strong'], 'soft');

        $ranges = [
            'gradient_angle' => [0, 360],
            'avatar_size' => [64, 180],
            'title_size' => [20, 48],
            'bio_size' => [12, 24],
            'link_size' => [13, 22],
            'content_width' => [320, 760],
            'button_height' => [44, 82],
            'button_radius' => [0, 40],
            'button_border_width' => [0, 4],
            'link_gap' => [6, 30],
            'thumbnail_size' => [20, 56],
        ];

        foreach ($ranges as $key => [$minimum, $maximum]) {
            $settings[$key] = max($minimum, min($maximum, (int) $settings[$key]));
        }

        return $settings;
    }

    public static function fontStack(string $font): string
    {
        return [
            'serif' => 'Georgia, Cambria, "Times New Roman", serif',
            'rounded' => 'Nunito, "Arial Rounded MT Bold", system-ui, sans-serif',
            'sans' => '"Open Sans", "Segoe UI", Arial, sans-serif',
        ][$font] ?? '"Open Sans", "Segoe UI", Arial, sans-serif';
    }

    public static function avatarRadius(string $shape): string
    {
        return ['square' => '0', 'rounded' => '22%', 'circle' => '50%'][$shape] ?? '50%';
    }

    public static function shadow(string $shadow): string
    {
        return [
            'none' => 'none',
            'soft' => '0 10px 30px rgba(4, 67, 78, .12)',
            'strong' => '0 16px 42px rgba(4, 53, 66, .26)',
        ][$shadow] ?? 'none';
    }

    public static function directionForText(string $text): string
    {
        return preg_match('/[\x{0590}-\x{08FF}]/u', $text) ? 'rtl' : 'ltr';
    }

    private static function choice($value, array $allowed, string $fallback): string
    {
        return in_array($value, $allowed, true) ? $value : $fallback;
    }
}
