-- =====================================================================
-- DEMONSTRATION DATA — not real tasks.
-- Every row is marked is_demo = true and shows a "Demo" badge in the app.
-- Demo tasks have no owner and use a placeholder WhatsApp number.
-- Remove them any time with:  delete from public.tasks where is_demo;
-- =====================================================================

with demo (headline, description, reward_cents, location, minutes_left, duration) as (
  values
    ('Assemble IKEA desk',     'One desk, all parts ready. Tools at home.',             5000, 'Achrafieh',  102, 180),
    ('Pick up a package',      'From DHL in Hamra and deliver to me in Verdun.',        3000, 'Hamra',       58,  60),
    ('Take my dog for a walk', '30–45 min around the Corniche. Friendly golden.',       2000, 'Ras Beirut',  26,  60),
    ('Move a small sofa',      'From Achrafieh to Sin El Fil. Two people needed.',      8000, 'Achrafieh',  195, 360),
    ('Buy groceries',          'A few items, I''ll send the list on WhatsApp.',         1500, 'Verdun',      47,  60),
    ('Fix my laptop',          'It won''t turn on. Need a quick diagnosis today.',     10000, 'Gemmayze',   128, 180),
    ('Hang three shelves',     'Drill + wall plugs needed. Concrete wall.',             2500, 'Mar Mikhael', 300, 360),
    ('Queue at the embassy',   'Hold my place in line from 7am until I arrive.',        4000, 'Baabda',     600, 720)
)
insert into public.tasks (
  user_id, poster_name, headline, description, reward_cents, location, duration_minutes,
  status, is_free, is_demo, content_hash, published_at, expires_at
)
select
  null, 'Demo', d.headline, d.description, d.reward_cents, d.location, d.duration,
  'active', true, true,
  public.task_content_hash(d.headline, d.description, d.location),
  now() - make_interval(mins => d.duration - d.minutes_left),
  now() + make_interval(mins => d.minutes_left)
from demo d;

insert into public.task_contacts (task_id, whatsapp)
select id, '+96170000000' from public.tasks where is_demo
on conflict (task_id) do nothing;
