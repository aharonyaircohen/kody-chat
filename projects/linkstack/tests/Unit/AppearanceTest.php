<?php

namespace Tests\Unit;

use App\Support\Appearance;
use PHPUnit\Framework\TestCase;

class AppearanceTest extends TestCase
{
    public function test_it_normalizes_all_public_appearance_controls(): void
    {
        $settings = Appearance::normalize([
            'background_type' => 'gradient',
            'gradient_kind' => 'radial',
            'gradient_angle' => 999,
            'avatar_size' => 10,
            'button_height' => 200,
            'button_style' => 'glass',
            'text_align' => 'start',
            'accent_color' => 'not-a-color',
        ]);

        $this->assertSame('radial', $settings['gradient_kind']);
        $this->assertSame(360, $settings['gradient_angle']);
        $this->assertSame(64, $settings['avatar_size']);
        $this->assertSame(82, $settings['button_height']);
        $this->assertSame('glass', $settings['button_style']);
        $this->assertSame('start', $settings['text_align']);
        $this->assertSame(Appearance::defaults()['accent_color'], $settings['accent_color']);
    }

    public function test_water_is_the_complete_default_preset(): void
    {
        $settings = Appearance::defaults();

        $this->assertSame('#d9fbf7', $settings['gradient_start']);
        $this->assertSame('#3eb6c5', $settings['gradient_end']);
        $this->assertSame('glass', $settings['button_style']);
        $this->assertSame('circle', $settings['avatar_shape']);
    }

    public function test_direction_follows_the_profile_language(): void
    {
        $this->assertSame('rtl', Appearance::directionForText('יאיר אהרון כהן Digital Reality'));
        $this->assertSame('rtl', Appearance::directionForText('مرحبا بالعالم'));
        $this->assertSame('ltr', Appearance::directionForText('Aharon Yair Cohen'));
    }
}
