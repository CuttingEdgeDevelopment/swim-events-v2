-- Country column for events (see flags/DB-PLAN.md in the project files).
--
-- Until now the country only lived in the free text of `location` ("Basel (SUI)").
-- This adds a `countries` lookup table, a table of common wrong codes, and
-- `events.country`, filled from `location`. Only additions: `location` stays as it is,
-- and the site keeps working before and after this runs.
--
-- The country rows mirror `src/lib/countries.ts`; the aliases mirror COUNTRY_ALIASES there.

-- 1. Countries: IOC code (stored on events), ISO alpha-2 code of the flag, English name
create table public.countries (
  ioc text primary key check (ioc ~ '^[A-Z]{3}$'),
  iso2 text check (iso2 ~ '^[a-z]{2}$'),
  name text not null
);

comment on table public.countries is 'Olympic (IOC) country codes with flag (ISO alpha-2) and English name';
comment on column public.countries.iso2 is 'null when the country has no flag of its own (Chinese Taipei)';

alter table public.countries enable row level security;
create policy "Countries are readable by everyone" on public.countries for select using (true);

insert into public.countries (ioc, iso2, name) values
  ('AFG', 'af', 'Afghanistan'),
  ('ALB', 'al', 'Albania'),
  ('ALG', 'dz', 'Algeria'),
  ('AND', 'ad', 'Andorra'),
  ('ANG', 'ao', 'Angola'),
  ('ANT', 'ag', 'Antigua and Barbuda'),
  ('ARG', 'ar', 'Argentina'),
  ('ARM', 'am', 'Armenia'),
  ('ARU', 'aw', 'Aruba'),
  ('ASA', 'as', 'American Samoa'),
  ('AUS', 'au', 'Australia'),
  ('AUT', 'at', 'Austria'),
  ('AZE', 'az', 'Azerbaijan'),
  ('BAH', 'bs', 'Bahamas'),
  ('BAN', 'bd', 'Bangladesh'),
  ('BAR', 'bb', 'Barbados'),
  ('BDI', 'bi', 'Burundi'),
  ('BEL', 'be', 'Belgium'),
  ('BEN', 'bj', 'Benin'),
  ('BER', 'bm', 'Bermuda'),
  ('BHU', 'bt', 'Bhutan'),
  ('BIH', 'ba', 'Bosnia and Herzegovina'),
  ('BIZ', 'bz', 'Belize'),
  ('BLR', 'by', 'Belarus'),
  ('BOL', 'bo', 'Bolivia'),
  ('BOT', 'bw', 'Botswana'),
  ('BRA', 'br', 'Brazil'),
  ('BRN', 'bh', 'Bahrain'),
  ('BRU', 'bn', 'Brunei'),
  ('BUL', 'bg', 'Bulgaria'),
  ('BUR', 'bf', 'Burkina Faso'),
  ('CAF', 'cf', 'Central African Republic'),
  ('CAM', 'kh', 'Cambodia'),
  ('CAN', 'ca', 'Canada'),
  ('CAY', 'ky', 'Cayman Islands'),
  ('CGO', 'cg', 'Congo'),
  ('CHA', 'td', 'Chad'),
  ('CHI', 'cl', 'Chile'),
  ('CHN', 'cn', 'China'),
  ('CIV', 'ci', 'Côte d''Ivoire'),
  ('CMR', 'cm', 'Cameroon'),
  ('COD', 'cd', 'DR Congo'),
  ('COK', 'ck', 'Cook Islands'),
  ('COL', 'co', 'Colombia'),
  ('COM', 'km', 'Comoros'),
  ('CPV', 'cv', 'Cabo Verde'),
  ('CRC', 'cr', 'Costa Rica'),
  ('CRO', 'hr', 'Croatia'),
  ('CUB', 'cu', 'Cuba'),
  ('CYP', 'cy', 'Cyprus'),
  ('CZE', 'cz', 'Czechia'),
  ('DEN', 'dk', 'Denmark'),
  ('DJI', 'dj', 'Djibouti'),
  ('DMA', 'dm', 'Dominica'),
  ('DOM', 'do', 'Dominican Republic'),
  ('ECU', 'ec', 'Ecuador'),
  ('EGY', 'eg', 'Egypt'),
  ('ERI', 'er', 'Eritrea'),
  ('ESA', 'sv', 'El Salvador'),
  ('ESP', 'es', 'Spain'),
  ('EST', 'ee', 'Estonia'),
  ('ETH', 'et', 'Ethiopia'),
  ('FIJ', 'fj', 'Fiji'),
  ('FIN', 'fi', 'Finland'),
  ('FRA', 'fr', 'France'),
  ('FSM', 'fm', 'Micronesia'),
  ('GAB', 'ga', 'Gabon'),
  ('GAM', 'gm', 'Gambia'),
  ('GBR', 'gb', 'Great Britain'),
  ('GBS', 'gw', 'Guinea-Bissau'),
  ('GEO', 'ge', 'Georgia'),
  ('GEQ', 'gq', 'Equatorial Guinea'),
  ('GER', 'de', 'Germany'),
  ('GHA', 'gh', 'Ghana'),
  ('GRE', 'gr', 'Greece'),
  ('GRN', 'gd', 'Grenada'),
  ('GUA', 'gt', 'Guatemala'),
  ('GUI', 'gn', 'Guinea'),
  ('GUM', 'gu', 'Guam'),
  ('GUY', 'gy', 'Guyana'),
  ('HAI', 'ht', 'Haiti'),
  ('HKG', 'hk', 'Hong Kong'),
  ('HON', 'hn', 'Honduras'),
  ('HUN', 'hu', 'Hungary'),
  ('INA', 'id', 'Indonesia'),
  ('IND', 'in', 'India'),
  ('IRI', 'ir', 'Iran'),
  ('IRL', 'ie', 'Ireland'),
  ('IRQ', 'iq', 'Iraq'),
  ('ISL', 'is', 'Iceland'),
  ('ISR', 'il', 'Israel'),
  ('ISV', 'vi', 'US Virgin Islands'),
  ('ITA', 'it', 'Italy'),
  ('IVB', 'vg', 'British Virgin Islands'),
  ('JAM', 'jm', 'Jamaica'),
  ('JOR', 'jo', 'Jordan'),
  ('JPN', 'jp', 'Japan'),
  ('KAZ', 'kz', 'Kazakhstan'),
  ('KEN', 'ke', 'Kenya'),
  ('KGZ', 'kg', 'Kyrgyzstan'),
  ('KIR', 'ki', 'Kiribati'),
  ('KOR', 'kr', 'Korea'),
  ('KOS', 'xk', 'Kosovo'),
  ('KSA', 'sa', 'Saudi Arabia'),
  ('KUW', 'kw', 'Kuwait'),
  ('LAO', 'la', 'Laos'),
  ('LAT', 'lv', 'Latvia'),
  ('LBA', 'ly', 'Libya'),
  ('LBN', 'lb', 'Lebanon'),
  ('LBR', 'lr', 'Liberia'),
  ('LCA', 'lc', 'Saint Lucia'),
  ('LES', 'ls', 'Lesotho'),
  ('LIE', 'li', 'Liechtenstein'),
  ('LTU', 'lt', 'Lithuania'),
  ('LUX', 'lu', 'Luxembourg'),
  ('MAD', 'mg', 'Madagascar'),
  ('MAR', 'ma', 'Morocco'),
  ('MAS', 'my', 'Malaysia'),
  ('MAW', 'mw', 'Malawi'),
  ('MDA', 'md', 'Moldova'),
  ('MDV', 'mv', 'Maldives'),
  ('MEX', 'mx', 'Mexico'),
  ('MGL', 'mn', 'Mongolia'),
  ('MHL', 'mh', 'Marshall Islands'),
  ('MKD', 'mk', 'North Macedonia'),
  ('MLI', 'ml', 'Mali'),
  ('MLT', 'mt', 'Malta'),
  ('MNE', 'me', 'Montenegro'),
  ('MON', 'mc', 'Monaco'),
  ('MOZ', 'mz', 'Mozambique'),
  ('MRI', 'mu', 'Mauritius'),
  ('MTN', 'mr', 'Mauritania'),
  ('MYA', 'mm', 'Myanmar'),
  ('NAM', 'na', 'Namibia'),
  ('NCA', 'ni', 'Nicaragua'),
  ('NED', 'nl', 'Netherlands'),
  ('NEP', 'np', 'Nepal'),
  ('NGR', 'ng', 'Nigeria'),
  ('NIG', 'ne', 'Niger'),
  ('NOR', 'no', 'Norway'),
  ('NRU', 'nr', 'Nauru'),
  ('NZL', 'nz', 'New Zealand'),
  ('OMA', 'om', 'Oman'),
  ('PAK', 'pk', 'Pakistan'),
  ('PAN', 'pa', 'Panama'),
  ('PAR', 'py', 'Paraguay'),
  ('PER', 'pe', 'Peru'),
  ('PHI', 'ph', 'Philippines'),
  ('PLE', 'ps', 'Palestine'),
  ('PLW', 'pw', 'Palau'),
  ('PNG', 'pg', 'Papua New Guinea'),
  ('POL', 'pl', 'Poland'),
  ('POR', 'pt', 'Portugal'),
  ('PRK', 'kp', 'DPR Korea'),
  ('PUR', 'pr', 'Puerto Rico'),
  ('QAT', 'qa', 'Qatar'),
  ('ROU', 'ro', 'Romania'),
  ('RSA', 'za', 'South Africa'),
  ('RUS', 'ru', 'Russia'),
  ('RWA', 'rw', 'Rwanda'),
  ('SAM', 'ws', 'Samoa'),
  ('SEN', 'sn', 'Senegal'),
  ('SEY', 'sc', 'Seychelles'),
  ('SGP', 'sg', 'Singapore'),
  ('SKN', 'kn', 'Saint Kitts and Nevis'),
  ('SLE', 'sl', 'Sierra Leone'),
  ('SLO', 'si', 'Slovenia'),
  ('SMR', 'sm', 'San Marino'),
  ('SOL', 'sb', 'Solomon Islands'),
  ('SOM', 'so', 'Somalia'),
  ('SRB', 'rs', 'Serbia'),
  ('SRI', 'lk', 'Sri Lanka'),
  ('SSD', 'ss', 'South Sudan'),
  ('STP', 'st', 'Sao Tome and Principe'),
  ('SUD', 'sd', 'Sudan'),
  ('SUI', 'ch', 'Switzerland'),
  ('SUR', 'sr', 'Suriname'),
  ('SVK', 'sk', 'Slovakia'),
  ('SWE', 'se', 'Sweden'),
  ('SWZ', 'sz', 'Eswatini'),
  ('SYR', 'sy', 'Syria'),
  ('TAN', 'tz', 'Tanzania'),
  ('TGA', 'to', 'Tonga'),
  ('THA', 'th', 'Thailand'),
  ('TJK', 'tj', 'Tajikistan'),
  ('TKM', 'tm', 'Turkmenistan'),
  ('TLS', 'tl', 'Timor-Leste'),
  ('TOG', 'tg', 'Togo'),
  ('TPE', null, 'Chinese Taipei'),
  ('TTO', 'tt', 'Trinidad and Tobago'),
  ('TUN', 'tn', 'Tunisia'),
  ('TUR', 'tr', 'Türkiye'),
  ('TUV', 'tv', 'Tuvalu'),
  ('UAE', 'ae', 'United Arab Emirates'),
  ('UGA', 'ug', 'Uganda'),
  ('UKR', 'ua', 'Ukraine'),
  ('URU', 'uy', 'Uruguay'),
  ('USA', 'us', 'United States'),
  ('UZB', 'uz', 'Uzbekistan'),
  ('VAN', 'vu', 'Vanuatu'),
  ('VEN', 've', 'Venezuela'),
  ('VIE', 'vn', 'Vietnam'),
  ('VIN', 'vc', 'Saint Vincent and the Grenadines'),
  ('YEM', 'ye', 'Yemen'),
  ('ZAM', 'zm', 'Zambia'),
  ('ZIM', 'zw', 'Zimbabwe');

-- 2. Codes that are easily typed instead of the IOC code, mostly ISO alpha-3
create table public.country_aliases (
  alias text primary key check (alias ~ '^[A-Z]{3}$'),
  ioc text not null references public.countries (ioc)
);

comment on table public.country_aliases is 'Wrong country codes and the IOC code they are corrected to, e.g. MCO -> MON';

-- read only by the trigger below, so no policy
alter table public.country_aliases enable row level security;

insert into public.country_aliases (alias, ioc) values
  ('BGR', 'BUL'),
  ('CHE', 'SUI'),
  ('DEU', 'GER'),
  ('DNK', 'DEN'),
  ('GRC', 'GRE'),
  ('HRV', 'CRO'),
  ('MCO', 'MON'),
  ('NLD', 'NED'),
  ('PRT', 'POR'),
  ('SVN', 'SLO');

-- 3. Whenever an event is saved: take the country from `location` when it's left empty
-- ("Basel (SUI)", or the older "HUN, Hungary, Budapest"), and quietly correct aliases
-- ("mco" becomes "MON"). A code that is still unknown is rejected by the foreign key.
-- security definer, so it can read the aliases whoever saves the event.
create function public.normalize_event_country() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.country := upper(trim(coalesce(
    new.country,
    substring(new.location from '\(([A-Za-z]{3})\)\s*$'),
    substring(new.location from '^([A-Za-z]{3}),')
  )));
  new.country := coalesce(
    (select a.ioc from public.country_aliases a where a.alias = new.country),
    new.country
  );
  return new;
end
$$;

-- 4. The column, filled from the code in `location`
alter table public.events add column country text references public.countries (ioc);

comment on column public.events.country is 'IOC code of the country the event takes place in';

create trigger events_normalize_country
  before insert or update of country on public.events
  for each row execute function public.normalize_event_country();

-- Fill every existing event through the trigger
update public.events set country = null;

-- Stops here, without changing anything, if an event has no known country
do $$
begin
  if exists (select 1 from public.events where country is null) then
    raise exception 'events without a country: %',
      (select string_agg(id || ' ' || location, ', ') from public.events where country is null);
  end if;
end
$$;

alter table public.events alter column country set not null;

-- 5. Keep the text in line with the corrected code
update public.events set location = 'Monaco (MON)' where location = 'Monaco (MCO)';
