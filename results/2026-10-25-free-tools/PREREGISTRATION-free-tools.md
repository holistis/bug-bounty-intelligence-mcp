# Vooraf vastgelegd: gratis tools naast onze scan (25 okt 2026, voor er een oordeel van de rechters is)

Vraag: hoeveel van de bekende High en Medium bevindingen vinden twee gratis, veel gebruikte statische tools op dezelfde wedstrijden, beoordeeld door dezelfde twee rechters met dezelfde regels als onze scan?

Tools en instellingen. Slither 0.11.6 (draait via de Foundry-bouw van het project; Low, Informational en Optimization uitgesloten) en Aderyn 0.6.8 (alle High en Low meldingen). Beide met standaardinstellingen, zonder eigen detectoren of afstelling. De uitvoer wordt omgezet naar hypotheses: een hypothese per melding van een detector, met de titel van de detector, het eerste bestand, de functie waar die genoemd wordt en de beschrijving van de tool. Meldingen waarvan alle bestanden in lib, node_modules, test, tests, mock, mocks, script, scripts of interfaces staan, tellen niet mee (dezelfde soort filter als onze scan). Hooguit 40 hypotheses per wedstrijd, gerangschikt op ernst en zekerheid die de tool zelf geeft.

Wedstrijden. Alleen wedstrijden waarop de tool in onze opzet draait; waar hij niet draait (bouwfout, ontbrekende afhankelijkheden, geen bronbestanden gevonden) wordt dat gemeld en telt hij niet mee. Twee sets: de verse set (de 9 Code4rena-wedstrijden van sep 2025 tot mrt 2026) en de ontwikkelset (oudere Code4rena-wedstrijden, zes bouwbare).

Maat en rechters. Zoals bij onze scan: een treffer is strikt als beide rechters (verschillende modelfamilies) dezelfde bekende bevinding noemen. We rapporteren per tool en per set: bekende bevindingen op de wedstrijden waar de tool draaide, strikte treffers, aantal hypotheses en treffers per hypothese. Daarnaast, op precies dezelfde wedstrijden, het resultaat van onze scan (de eerste 15 en de hele lijst) zodat de vergelijking op dezelfde ondergrond staat.

Geen lat. Dit is een vergelijking, geen toets van een hypothese: wat eruit komt wordt gepubliceerd zoals het is, ook als de gratis tools beter blijken.

Wat dit niet zegt: statische tools zijn niet gebouwd om logische fouten te vinden; ze zijn gratis en snel en vinden andere dingen. Dat de rechters taalmodellen zijn en dat dit onze eigen meting is, geldt ook hier. Onze scan kent de oudere wedstrijden mogelijk al, de tools niet.
