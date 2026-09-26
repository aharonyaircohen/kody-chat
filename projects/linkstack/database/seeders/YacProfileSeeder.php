<?php

namespace Database\Seeders;

use App\Models\Button;
use App\Models\Link;
use App\Models\User;
use App\Support\Appearance;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class YacProfileSeeder extends Seeder
{
    public function run()
    {
        $email = env('SEED_ADMIN_EMAIL', 'admin@example.test');
        if (User::where('email', $email)->exists()) {
            return;
        }

        $user = User::create([
                'name' => 'יאיר אהרון כהן',
                'email' => $email,
                'password' => Hash::make(env('SEED_ADMIN_PASSWORD', 'change-me-now')),
                'email_verified_at' => now(),
                'littlelink_name' => 'aharonyaircohen',
                'littlelink_description' => "🌀 מים\n💧 נשימה\n🧘🏻‍♀️ תודעה\n🌀\nקורסים דיגיטליים סדנאות ותהליכי ריפוי",
                'role' => 'admin',
                'block' => 'no',
                'theme' => 'water',
                'image' => json_encode(['appearance' => Appearance::defaults(), 'links-new-tab' => true]),
        ]);

        $seedAvatar = database_path('seeders/assets/yac-profile.jpg');
        if (file_exists($seedAvatar)) {
            copy($seedAvatar, base_path('assets/img/' . $user->id . '_seed.jpg'));
        }

        $websiteButton = Button::where('name', 'custom_website')->value('id');
        $emailButton = Button::where('name', 'default email')->value('id');
        $iconButton = Button::where('name', 'icon')->value('id');

        $links = [
            ['title' => 'בניית מערכת ימה - Digital Reality', 'link' => 'https://thedigitalreality.net/courses/building-yama/', 'thumbnail' => 'https://ugc.production.linktr.ee/a40a0ea7-ef3f-4de4-9270-17a778fd9a3b_Copy-of-Water-Template-1-1-1024x576.jpeg'],
            ['title' => 'בניית מערכת ימה - קבוצת תמיכה', 'link' => 'https://chat.whatsapp.com/IbKcp5EnnR25qI4h3IkRTr', 'thumbnail' => 'https://ugc.production.linktr.ee/b9ba35ca-2f39-4e67-94c3-9e68926b88ae_image.png'],
            ['title' => 'מהי התייבשות כרונית – קורס דיגיטלי', 'link' => 'https://thedigitalreality.net/courses/chronic-dehydration/', 'thumbnail' => 'https://ugc.production.linktr.ee/6e4e3aac-b758-4bc6-b75e-2478885b631f_Add-a-heading.jpeg'],
            ['title' => 'מערכת המציאות הדיגיטלית', 'link' => 'https://thedigitalreality.net/', 'thumbnail' => 'https://ugc.production.linktr.ee/a22f374b-ea64-4244-b549-983ad271e54d_image.png'],
            ['title' => 'מעגלי צמיחה - סדנאות', 'link' => 'https://chat.whatsapp.com/F1vtwpZK33Z3ZZc3bA03Ie', 'thumbnail' => null],
            ['title' => 'לכל שאלה נוספת שלח.י הודעה', 'link' => 'https://wa.me/+972502171468', 'thumbnail' => 'https://ugc.production.linktr.ee/a12ed552-b366-4082-aabb-10a4b0880d23_image.png'],
        ];

        foreach ($links as $order => $item) {
            Link::updateOrCreate(
                ['user_id' => $user->id, 'link' => $item['link']],
                [
                    'title' => $item['title'],
                    'button_id' => $websiteButton,
                    'type' => 'link',
                    'type_params' => json_encode(array_filter(['thumbnail' => $item['thumbnail']])),
                    'order' => $order,
                    'up_link' => 'no',
                ]
            );
        }

        foreach ([
            ['instagram', 'https://instagram.com/aharonyaircoh'],
            ['facebook', 'https://www.facebook.com/profile.php?id=100069604805109'],
        ] as [$title, $url]) {
            Link::updateOrCreate(
                ['user_id' => $user->id, 'link' => $url],
                ['title' => $title, 'button_id' => $iconButton, 'type' => 'predefined', 'order' => 100]
            );
        }

        Link::updateOrCreate(
            ['user_id' => $user->id, 'link' => 'mailto:aharon.yair.cohen@gmail.com'],
            ['title' => 'Email', 'button_id' => $emailButton, 'type' => 'predefined', 'order' => 101]
        );
    }
}
