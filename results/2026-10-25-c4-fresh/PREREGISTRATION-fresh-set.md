# Vooraf vastgelegd: de verse set van Code4rena-wedstrijden (25 okt 2026, voor er een scan op gedraaid is)

Vraag: houdt de uitslag van de scan (8 van 105 op Sherlock) stand op wedstrijden die recenter zijn en niet in de opbouw van de scan zijn gebruikt?

Set: alle Code4rena-wedstrijden met een repository die is aangemaakt vanaf 15 augustus 2025 (naam begint met 20YY-MM-, zonder mitigation, bounty of round), met een openbaar eindrapport op code4rena.com/reports/<naam>, minstens 2 bekende High of Medium in dat rapport en minstens 3 Solidity-bestanden in de scope van onze motor. De lijst van opgenomen en uitgesloten wedstrijden (met reden) staat in set/. Hash van de set: zie onder.

Geen splitsing: er zijn maar 9 wedstrijden die aan de eisen voldoen (7 uit 2025 en 2 uit 2026), met samen 66 bekende bevindingen, dus de hele set telt als een meting. Wedstrijden zonder eindrapport (8 van de 24 kandidaten) komen erbij zodra hun rapport openbaar is; die latere wedstrijden vormen de vooruitkijkende set van de wekelijkse leerlus.

Systeem: V3.1 zoals het sinds de avond van 25 oktober in productie staat (zelfde model, zelfde acht brillen, zelfde instellingen als V3_CONFIG van de productierunner), een run per wedstrijd, de volledige lijst bewaard (maximaal 200). De uitkomst voor "top 15" is de eerste 15 op zelfvertrouwen, zoals productie ze laat zien. Mislukte runs tellen als 0 en worden gemeld.

Rechters: dezelfde twee als in de Sherlock-meting (andere modelfamilies), dezelfde prompt, strikt = beide noemen dezelfde bekende bevinding. Moeilijkheid naar aantal indieners zoals bij Sherlock (5 of meer makkelijk, 3 of 4 midden, 1 of 2 moeilijk), maar de aantallen komen uit de "Submitted by"-regel van het rapport en zijn dus een benadering.

Hoe we de uitslag lezen (vooraf, top 15 strikt, opgeteld over alle 9 wedstrijden):
- 5 procent of meer van de bekende bevindingen: de uitslag houdt stand op nieuwere wedstrijden (Sherlock was 7,6).
- 3 tot 5 procent: zwakker dan Sherlock, maar niet nul.
- minder dan 3 procent: de Sherlock-uitslag overschat de scan (onthouden wedstrijden of een andere opzet); dan zeggen we dat openlijk in de notitie en de README.

Beperkingen die er in elk geval bij horen: C4-rapporten tellen samengevoegde bevindingen en laten bevindingen weg die als duplicaat of te laag zijn beoordeeld, dus het aantal bekende is niet gelijk aan dat van Sherlock; wedstrijden uit het begin van 2026 kunnen nog in de opleiding van een model zitten (de einddatum van de modellen is niet bekend); een run per wedstrijd en kleine aantallen, dus een herhaling kan merkbaar anders uitvallen; de rechters zijn taalmodellen en dit is onze eigen meting.

Kosten: grens 3 dollar voor alle scans samen (de scan kost 0,02 tot 0,15 dollar per wedstrijd), rechters ongeveer 1 dollar. Stopt bij overschrijding.
