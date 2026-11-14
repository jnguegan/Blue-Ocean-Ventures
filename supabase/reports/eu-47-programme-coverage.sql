with p(no, programme, id_re, name_re) as (values
 (1,'Horizon Europe','^HORIZON-(?!EIC|EIT)','Horizon Europe'),
 (2,'European Innovation Council (EIC)','^HORIZON-EIC','European Innovation Council'),
 (3,'European Institute of Innovation and Technology (EIT)','^HORIZON-EIT','\mEIT ?[A-Z]'),
 (4,'Digital Europe','^DIGITAL-','Digital Europe'),
 (5,'InvestEU','^INVESTEU','InvestEU'),
 (6,'Single Market Programme','^SMP-','Single Market Programme'),
 (7,'Connecting Europe Facility (CEF)','^CEF-','Connecting Europe Facility'),
 (8,'Euratom Research and Training','^EURATOM-','Euratom'),
 (9,'ITER','^(ITER|F4E)','\mITER\M|Fusion for Energy'),
 (10,'European Space Programme','^(EUSPA|SPACE)-','EU Space Programme|EUSPA'),
 (11,'Research Fund for Coal and Steel','^RFCS-','Coal and Steel'),
 (12,'Erasmus+','^ERASMUS-','Erasmus'),
 (13,'European Social Fund Plus (ESF+)','^(ESF|SOCPL)-','ESF\+|European Social Fund'),
 (14,'European Solidarity Corps','^ESC-','Solidarity Corps'),
 (15,'Citizens, Equality, Rights and Values (CERV)','^CERV-','Citizens, Equality, Rights'),
 (16,'Justice Programme','^JUST-','Justice Programme'),
 (17,'Creative Europe','^CREA-','Creative Europe'),
 (18,'EU4Health','^EU4H-','EU4Health'),
 (19,'European Regional Development Fund (ERDF)','^ERDF','ERDF|EFRE|Regional Development Fund'),
 (20,'Just Transition Fund (JTF)','^JTF','Just Transition Fund'),
 (21,'Cohesion Fund','^CF-','Cohesion Fund'),
 (22,'Interreg','^INTERREG','Interreg'),
 (23,'European Urban Initiative (EUI)','^EUI-','European Urban Initiative'),
 (24,'URBACT','^URBACT','URBACT'),
 (25,'ESPON','^ESPON','ESPON'),
 (26,'Interregional Innovation Investments (I3)','^I3-','Interregional Innovation Investment'),
 (27,'Recovery and Resilience Facility (RRF)','^RRF','Recovery and Resilience'),
 (28,'Technical Support Instrument (TSI)','^TSI','Technical Support Instrument'),
 (29,'LIFE','^LIFE-','\mLIFE\M programme'),
 (30,'Innovation Fund','^INNOVFUND-','Innovation Fund'),
 (31,'Modernisation Fund','^MODF','Modernisation Fund'),
 (32,'European Agricultural Guarantee Fund (EAGF)','^(EAGF|AGRIP)-','Agricultural Guarantee|promotion of agricultural'),
 (33,'European Agricultural Fund for Rural Development (EAFRD)','^EAFRD','EAFRD|Fund for Rural Development'),
 (34,'European Maritime, Fisheries and Aquaculture Fund (EMFAF)','^EMFAF-','EMFAF|Maritime, Fisheries'),
 (35,'Asylum, Migration and Integration Fund (AMIF)','^AMIF-','Asylum, Migration and Integration'),
 (36,'Internal Security Fund (ISF)','^ISF-','Internal Security Fund'),
 (37,'Border Management and Visa Instrument (BMVI)','^BMVI-','Border Management and Visa'),
 (38,'European Defence Fund (EDF)','^EDF-','European Defence Fund'),
 (39,'EU Civil Protection Mechanism (rescEU)','^UCPM-','Civil Protection Mechanism|rescEU'),
 (40,'EU Anti-Fraud Programme','^EUAF-','Anti-Fraud'),
 (41,'Fiscalis','^FISC','Fiscalis'),
 (42,'Customs Programme','^CUST','Customs Programme'),
 (43,'Global Europe (NDICI)','^(NDICI|EUROPEAID)','Global Europe|NDICI|EuropeAid|civil society organisations for actions in'),
 (44,'Instrument for Pre-Accession Assistance (IPA III)','^IPA','IPA III|Pre-Accession'),
 (45,'EU Humanitarian Aid','^ECHO','Humanitarian Aid'),
 (46,'Common Foreign and Security Policy (CFSP)','^(CFSP|FPI)','Foreign and Security Policy'),
 (47,'Overseas Countries and Territories','^OCT','Overseas Countries and Territories')
),
c as (
 select id, coalesce(parent_topic_id,'') as tid,
        concat_ws(' | ', parent_topic, programme, title) as txt
 from public.bov_eu_funding_calls
 where status <> 'archived' and (deadline is null or deadline >= current_date)
),
m as (
 select p.no, c.id from p join c on (c.tid ~ p.id_re or c.txt ~* p.name_re)
)
select p.no, p.programme,
       count(distinct m.id) as live_calls_found
from p left join m on m.no = p.no
group by p.no, p.programme
union all
select 99, 'Not matched to any of the 47 (other EU calls)', count(*)
from c where not exists (select 1 from m where m.id = c.id)
order by 1;
