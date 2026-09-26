<?php

namespace Database\Seeders;

use App\Models\Button;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class YacDemoSeeder extends Seeder
{
    public function run()
    {
        if (Button::count() === 0) {
            $this->call(ButtonSeeder::class);
        }

        if (DB::table('pages')->count() === 0) {
            $this->call(PageSeeder::class);
        }

        $this->call(YacProfileSeeder::class);
    }
}
