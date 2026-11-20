import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseTextToGrid,
  extractSheetsFromWorkbook,
  chooseBestSheetIndex,
  extractSmartTableFromGrid,
  extractMonthlyStoreRowsFromGrid
} from './spreadsheet-smart-parser';
import { Store } from '../models';

// Recorte fiel do layout real de "RATEIO ENERGIA 2026" enviado pelo operador (35 linhas de resumo + cabeçalho linha 36 + lojas)
const REAL_ENERGIA_2026_CSV = [
  'RATEIO ENERGIA 2026,,,Anterior,Janeiro,,,,,,,,,,Fevereiro,,,,,,,,,,Março,,,,,,,,,,Abril,,,,,,,,,,Maio,,,,,,,,,,Junho,,,,,,,,,,Julho,,,,,,,,,,Agosto,,,,,,,,,,Setembro,,,,,,,,,,Outubro,,,,,,,,,,Novembro,,,,,,,,,,Dezembro,,,,,,,,',
  ',,Valor conta CEEE BSS-1 (UC 72207914),385110.04,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),460560.95,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),451828.51,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),423328.16,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),430562.17,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),389141.1,,,,,,,,,COMPANHIA EST. DISTRIB. ENERGI,356102.94,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),356513.77,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),344177.4,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),347864.47,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),344508.51,,,,,,,,,COMPANHIA ESTADUAL DE DISTRIBUIC,368377.16,,,,,,,,,Valor conta CEEE BSS-1 (UC 72207914),0',
  ',,Valor conta CEMIG BSS-1,313135.83,,,,,,,,Valor conta CEMIG BSS-1,368909.18,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,373417.71,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,353433.37,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,362761.9,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,328903.33,,,Período de medição (concessionária),,Data leitura,,,,CEMIG GERACAO E TRANSMISSAO S.A,264278.2,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,236746.77,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,255463.15,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,257398.64,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,267277.57,,,Período de medição (concessionária),,Data leitura,,,,CEMIG GERACAO E TRANSMISSAO S.A,293850.21,,,Período de medição (concessionária),,Data leitura,,,,Valor conta CEMIG BSS-1,0',
  ',,Valor ENEVA,16419.35,,,,,,,,Valor Deal/ENEVA,28993.73,,,,,,,,,Valor ENEVA,39409.97,,,,,,,,,Valor Eneva,55678.72,,,,,,,,,Valor Eneva,56541.9,,,,,,,,,Valor ENEVA,0,,,,,,,,,Tarifa Bancaria,48.21,,,,,,,,,Valor ENEVA,3046.6,,,,,,,,,Valor ENEVA,0,,,,,,,,,Valor ENEVA,0,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,COMPANHIA ESTADUAL DE DISTRIBUIC,29757.75,,,,,,,,,Valor ENEVA,0',
  ',,Contribuição-1 associativa CCEE,105.74,,,,,,,,Contribuição-1 associativa CCEE,234.65,,,,,,,,,Contribuição-1 associativa CCEE,776.03,,,,,,,,,Contribuição-1 associativa CCEE,777.49,,,,,,,,,Contribuição-1 associativa CCEE,777.88,,,,,,,,,Contribuição-1 associativa CCEE,778.2,,,,,,,,,MEGA AUTOMACAO LTDA,493.63,,,,,,,,,Contribuição-1 associativa CCEE,778.79,,,,,,,,,Contribuição-1 associativa CCEE,779.63,,,,,,,,,Contribuição-1 associativa CCEE,780.83,,,,,,,,,,,,,,,,,,,CEMIG GERACAO E TRANSMISSAO S.A,16489.06,,,,,,,,,Contribuição-1 associativa CCEE,0',
  ',,Contabilização energia reserva - RES005,,,,,,,,,Contabilização energia reserva - RES005,23148.77,,,,,,,,,Contabilização energia reserva - RES005,23875.87,,,,,,,,,Contabilização energia reserva - RES005,22503.59,,,,,,,,,Contabilização energia reserva - RES005,20362.92,,,,,,,,,Contabilização energia reserva - RES005,0,,,,,,,,,COMPANHIA EST. DISTRIB. ENERGIA ELÉ,25534.66,,,,,,,,,Contabilização energia reserva - RES005,34225.29,,,,,,,,,Contabilização energia reserva - RES005,0,,,,,,,,,Contabilização energia reserva - RES005,0,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,COMPANHIA ESTADUAL DE DISTRIBUIC,19394.59,,,,,,,,,Contabilização energia reserva - RES005,0',
  ',,Tarifa bancária Bradesco,46.16,,,,,,,,Tarifa bancária Bradesco,46.16,,,,,,,,,Tarifa bancária Bradesco,46.16,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,CEMIG GERACAO E TRANSMISSAO S.A,10826.6,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,Tarifa bancária Bradesco,48.21,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),20271.62,,,,,,,,,COMPANHIA ESTADUAL DE DISTRIBUIC,12510.41,,,,,,,,,Tarifa bancária Bradesco,0',
  ',,Diferenças convertidas no rateio (ajustes),-2933.78,,,,,,,,Diferenças convertidas no rateio (ajustes),30641.63,,,,,,,,,Diferenças convertidas no rateio (ajustes ANGRA),15338.34,,,,,,,,,Diferenças convertidas no rateio (ajustes ANGRA),16500,,,,,,,,,Diferenças convertidas no Rateio (ajustes ANGRA),17000,,,,,,,,,Diferenças convertidas no rateio (ajustes Angras),0,,,,,,,,,COMPANHIA EST. DISTRIB. ENERGI,16950.18,,,,,,,,,CCEE e OP MERC de Energia,22869.88,,,,,,,,,Diferenças convertidas no rateio (ajustes),39084.96,,,,,,,,,Diferenças convertidas no rateio (ajustes),62842.02,,,,,,,,,Valor conta CEMIG BSS-2,9078.58,,,,,,,,,Contribuição-Associativa CCEE,781.06,,,,,,,,,Diferenças convertidas no rateio (ajustes),0',
  ',,Sumário (liq. Financeira) - SUM001,,,,,,,,,Sumário (liq. Financeira) - SUM001,,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,COMPANHIA EST. DISTRIB. ENERGIA ELÉ,16997.21,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,Sumário (liq. Financeira) - SUM001,0,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),17513.96,,,,,,,,,SICLO CONSULTORIA EM ENERGIA LTD,3456.15,,,,,,,,,Sumário (liq. Financeira) - SUM001,0',
  ',,Automação CAG - Microblau,471.56,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,Automação CAG Mega Automação / Microblau,493.63,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,SICLO CONSULTORIA EM ENERGIA LTDA,3307.33,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,Automação CAG - Microblau,493.63,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),14483.43,,,,,,,,,VERSA ENERGIA LTDA,7819.15,,,,,,,,,Automação CAG - Microblau,0',
  ',,Valor conta CEEE BSS-2 (UC 68203772),26829.46,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),32926.13,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),35485.96,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),33732.83,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),34950.95,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),30220.92,,,,,,,,,COMPANHIA EST. DISTRIB. ENERGI,4940.52,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),24448.28,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),23068.92,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),16034.53,,,,,,,,,Contribuição associativa CCE,781.08,,,,,,,,,tarifa,48.21,,,,,,,,,Valor conta CEEE BSS-2 (UC 68203772),0',
  ',,Valor conta CEMIG BSS-2,12743.4,,,,,,,,Valor conta CEMIG BSS-2,15786.77,,,,,,,,,Valor conta CEMIG BSS-2,17240.64,,,,,,,,,Valor conta CEMIG BSS-2,17723.26,,,,,,,,,Valor conta CEMIG BSS-2,18711.94,,,,,,,,,Valor conta CEMIG BSS-2,15704.81,,,,,,,,,VERSA ENERGIA LTDA,7502.3,,,,,,,,,Valor conta CEMIG BSS-2,25465.9,,,,,,,,,Valor conta CEMIG BSS-2,13511.88,,,,,,,,,Valor conta CEMIG BSS-2,13009.71,,,,,,,,,Valor Sico - Consultoria,3456.15,,,,,,,,,MEGA AUTOMACAO LTDA,493.63,,,,,,,,,Valor conta CEMIG BSS-2,0',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,Gestão Mercado Livre (Versa),7819.12,,,,,,,,,ENERGIA RESERVA,24134.27,,,,,,,,,,',
  ',,Valor conta CEEE BSS-3 (UC 64550214),21779.38,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),26573.87,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),27383.05,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),23858.86,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),22464.24,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),19835.28,,,,,,,,,CAMARA DE COMERCIALIZACAO DE ENERGI,779.05,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),17150.11,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),18947.3,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),18571.02,,,,,,,,,Automação CG - Microlab 09/2026,493.63,,,,,,,,,RESERVA DE CAPACIDADE DQ CAMARA DE COM DE,16730.76,,,,,,,,,Valor conta CEEE BSS-3 (UC 64550214),0',
  ',,Valor conta CEEE BSS-4 (UC 54031443),15392.62,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),17064.48,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),21739.02,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),22772.89,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),24044.98,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),20713.16,,,,,,,,,CCEE - ENERGIA RESERVA-5/2026,24061.84,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),16657.05,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),14022.9,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),12919.28,,,,,,,,,CCE - RESERVA DE CAPACIDADE-9/2026,11163.66,,,,,,,,,CCEE - COTAS DE ENERGIA NUCLEAR-10/2026,11242,,,,,,,,,Valor conta CEEE BSS-4 (UC 54031443),0',
  ',,Valor Siclo - Consultoria,3307.33,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,CCEE - ENERGIA RESERVA-5/2026,4523.18,,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,Valor Siclo - Consultoria,3307.33,,,,,,,,,Valor Siclo - Consultoria,3456.15,,,,,,,,,CCE - COTAS DE ENERGIA NUCLEAR-9/2026,11021.4,,,,,,,,,,-493.63,,,,,,,,,Valor Siclo - Consultoria,0',
  ',,Valor Agroenergia - Consultoria,0,,,,,,,,Valor Agroenergia - Consultoria,0,,,,,,,,,Subestação antiga AMARO,5596.18,,,,,,,,,Subestação antiga AMARO,5429.17,,,,,,,,,SUB ANTIGA AMARO,4943.88,,,,,,,,,SUBESTAÇÃO antiga AMARO,4897.28,,,,,,,,,CCEE - COTAS DE ENERGIA NUCLEAR-5/2026,13520.17,,,,,,,,,Juros,0,,,,,,,,,Valor Agroenergia - Consultoria,0,,,,,,,,,CEEE - ANTIGA AMARO,0,,,,,,,,,CREDITO CCE 09/2026,-5.18,,,,,,,,,OP MERC ENERG CURTO PRAZ BANCO BRADESCO /,-17797.65,,,,,,,,,Valor Agroenergia - Consultoria,0',
  ',,Gestão Mercado Livre (Versa),7136.18,,,,,,,,Gestão Mercado Livre (Versa),7502.3,,,,,,,,,Gestão Mercado Livre (Versa),5429.17,,,,,,,,,Gestão Mercado Livre (Versa),7136.18,,,,,,,,,Gestão Mercado Livre (Versa),7502.3,,,,,,,,,Gestão Mercado Livre (Versa),7502.3,,,,,,,,,OP MERC ENERG CURTO PRAZ,786.36,,,,,,,,,Gestão Mercado Livre (Versa),7502.3,,,,,,,,,Gestão Mercado Livre (Versa),7502.3,,,,,,,,,Gestão Mercado Livre (Versa),7502.3,,,,,,,,,CREDITO CCE 09/2026,-4999.03,,,,,,,,,,,,,,,,,,,Gestão Mercado Livre (Versa),0',
  ',,Fluxo de caixa,0,,,,,,,,Fluxo de caixa,0,,,,,,,,,AJUSTES DE CAIXA,-2603.16,,,,,,,,,Fluxo de caixa,-663.14,,,,,,,,,OPERAÇÃO ML DE CURTO PRAZO ,-3200.25,,,,,,,,,Ajustes fluxo,-3260.75,,,,,,,,,Ajuste,,,,,,,,,,Ajuste,0,,,,,,,,,Ajuste,0,,,,,,,,,Ajuste,0,,,,,,,,,CREDITO CCE 10/2026,-2570.44,,,,,,,,,,,,,,,,,,,Ajuste,0',
  ',,Guia judicial,15551.02,,,,,,,,Guia judicial,0,,,,,,,,,Guia judicial,0,,,,,,,,,Guia judicial,0,,,,,,,,,AJUSTES ANTERIORES,365.88,,,,,,,,,AJUSTES DIFERENÇAS,1800.97,,,,,,,,,Guia judicial,0,,,,,,,,,Guia judicial,0,,,,,,,,,EXTRA judicial,0,,,,,,,,,Guia judicial,0,,,,,,,,,ENERGIA RESERVA 9/2026,22546.33,,,,,,,,,,,,,,,,,,,Valor Faltante,0',
  ',,Consumo (ponta e fora ponta) BSS-1,1170386,,,,,,,,Consumo (ponta e fora ponta) BSS-1,1375714.43,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,1062977,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,1236646,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,1291350.48,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,1105416.48,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,939844.08,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,856270.8,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,937359.36,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,937060.12,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,924819,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,994683.48,,,,,,,,,Consumo (ponta e fora ponta) BSS-1,',
  ',,Consumo (ponta e fora ponta) BSS-2,47468,,,,,,,,Consumo (ponta e fora ponta) BSS-2,59224,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,66678,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,62327,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,66770.42,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,54188.74,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,39540.98,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,32961.01,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,36119.42,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,15866.01,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,29918.7,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,56889.59,,,,,,,,,Consumo (ponta e fora ponta) BSS-2,',
  ',,Consumo (ponta e fora ponta) BSS-3,52442,,,,,,,,Consumo (ponta e fora ponta) BSS-3,61851,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,68993,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,55654,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,50459.08,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,44291.8,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,37074.8,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,33440.96,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,42328.44,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,43377.72,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,38503.08,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,44315.6,,,,,,,,,Consumo (ponta e fora ponta) BSS-3,',
  ',,Consumo (ponta e fora ponta) BSS-4,27275,,,,,,,,Consumo (ponta e fora ponta) BSS-4,30420,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,44039,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,47649,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,49848.4,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,41171.2,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,29913.8,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,26275.2,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,21778.4,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,17905.3,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,22948.8,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,18879.7,,,,,,,,,Consumo (ponta e fora ponta) BSS-4,',
  ',,Custo total,815094.29,,,,,,,,Custo total,1016189.58,,,,,,,,,Custo total,1021367.57,,,,,,,,,Custo total,986060.55,,,,,,,,,Custo total,1001639.86,,,,,,,,,Custo total,820085.77,,,,,,,,,Custo total,750652.38,,,,,,,,,Custo total,749253.91,,,,,,,,,Custo total,720407.61,,,,,,,,,Custo total,740920.79,,,,,,,,,Custo total,723382.23,,,,,,,,,Custo total,786793.13,,,,,,,,,Custo total,0',
  ',,Consumo total,1297571,,,,,,,,Consumo total,1527209.43,,,,,,,,,Consumo total,1242687,,,,,,,,,Consumo total,1402276,,,,,,,,,Consumo total,1458428.38,,,,,,,,,Consumo total,1245068.22,,,,,,,,,Consumo total,1046373.66,,,,,,,,,Consumo total,948947.97,,,,,,,,,Consumo total,1037585.62,,,,,,,,,Consumo total,1014209.15,,,,,,,,,Consumo total,1016189.58,,,,,,,,,Consumo total,1114768.37,,,,,,,,,Consumo total,0',
  ',,Valor do kWh,0.6281,,,,,,,,Valor do kWh,0.6653,,,,,,,,,Valor do kWh,0.8219,,,,,,,,,Valor do kWh,0.7031,,,,,,,,,Valor do kWh,0.6867,,,,,,,,,Valor do kWh,0.6586,,,,,,,,,Valor do kWh,0.7173,,,,,,,,,Valor do kWh,0.7895,,,,,,,,,Valor do kWh,0.6943,,,,,,,,,Valor do kWh,0.7305,,,,,,,,,Valor do kWh,0.7118,,,,,,,,,Valor do kWh,0.7057,,,,,,,,,Valor do kWh,0',
  ',,Áreas Comuns,243302.22,,,,,,,Áreas Comuns,,368621.57,,,,,,,,Áreas Comuns,,772992.73,,,,,,,,Áreas Comuns,,760825.92,,,,,,,,Áreas Comuns,,790054.42,,,,,,,,Áreas Comuns,,618974.38,,,,,,,,Áreas Comuns,,191275.85,,,,,,,,Áreas Comuns,,188791.07,,,,,,,,Áreas Comuns,,253960.87,,,,,,499506.93,,Áreas Comuns,,241413.85,,,,,,,,Áreas Comuns,,200019.12,,,,,,,,Áreas Comuns,,188773.15,,,,,,,,Áreas Comuns,,0',
  ',,,0.3,,,Total recuperado,,,,,,0.36,,,,Total recuperado,,,,,,0.75,,,,Total recuperado,,,,,,0.77,,,,Total recuperado,,,,,,0.78,,,,Total recuperado,,,,,,0.75,,,,Total recuperado,,,,,,0.25,,,,Total recuperado,,,,,,0.25,,,,Total recuperado,,,,,,0.35,,,,Total recuperado,,241413.85,,,,0.32,,,,Total recuperado,,,,,,0.27,,,,Total recuperado,,,,,,0.23,,,,Total recuperado,,,,,,0',
  ',,,387319.5,,,0.02,,,,,,553993.42,,,,0.02,,,,,,940492,,,,0.02,,,,,,1081970,,,,0.02,,,,,,1150351.38,,,,0.10,,,,,,939737.48,,,,0.62,,,,,,266629.43,,,,0.69,,,,,,233849.40,,,,0.60,,,,,,378373.13,,,,0.61,,,,,,342727.26,,,,0.61,,,,,,280981.94,,,,0.61,,,,,,280131.37,,,,,,,,,,0',
  ',,Ar Condicionado,101763.43,,,,,,,Ar Condicionado,,87166.06,,,,,,,,Ar Condicionado,,221913.67,,,,,,,,Ar Condicionado,,204627.06,,,,,,,,Ar Condicionado,,189555.14,,,,,,,,Ar Condicionado,,112632.11,,,,,,,,Ar Condicionado,,85368.77,,,,,,,,Ar Condicionado,,42636.38,,,,,,,,Ar Condicionado,,33326.95,,,,,,1,,Ar Condicionado,,46754.58,,,,,,,,Ar Condicionado,,81151.76,,,,,,,,Ar Condicionado,,114338.09,,,,,,,,Ar Condicionado,,0',
  ',,,0.1248,,,,,,,,,0.0857,,,,,,,,,,0.2172,,,,,,,,,,0.21,,,,,,,,,,0.1892,,,,,,,,,,0.1373,,,,,,,,,,0.1137,,,,,,,,,,0.0569,,,,,,,,,,0.0462,,,,,,,,,,0.0631,,,,,,,,,,0.1121,,,,,,,,,,0.1453,,,,,,,,,,0',
  ',,,162000,,,,,,,,,131000,,,,,,,,,,270000,,,,,,,,,,291000,,,,,,,,,,276000,,,,,,,,,,171000,,,,,,,,,,119000,,,,,,,,,,54000,,,,,,,,,,48000,,,,,,,,,,64000,,,,,,,,,,114000,,,,,,,,,,162000,,,,,,,,,,162000',
  ',,Incorridos (lojistas),469826.99,,,,,,,Valor SAP,,23389.11,,,,,,,,Valor SAP,,25704.93,,,,,,,,Valor SAP,,20418.99,,,,,,,,Valor SAP,,22030.29,,,,,,,,Valor SAP,,88479.27,,,,,,,,Valor SAP,,472242.28,,,,,,,,Valor SAP,,517826.44,,,,,,,,Valor SAP,,433119.78,,,,,,,,Valor SAP,,452752.34,,,,,,,,Valor SAP,,442211.34,,,,,,,,Valor SAP,,483681.88,,,,,,,,Valor SAP,,0',
  ',,,0.5764,,,,,,,Incorridos (lojistas),,0.55,,,,,,,,Incorridos (lojistas),,0.02,,,,,,,,Incorridos (lojistas),,0.02,,,,,,,,Incorridos (lojistas),,0.02,,,,,,,,Incorridos (lojistas),,0.10,,,,,,,,Incorridos (lojistas),,0.62,,,,,,,,Incorridos (lojistas),,0.69,,,,,,,,Incorridos (lojistas),,0.60,,,,,,,,Incorridos (lojistas),,0.61,,,,,,,,Incorridos (lojistas),,0.61,,,,,,,,Incorridos (lojistas),,0.61,,,,,,,,Incorridos (lojistas),,0',
  ',,,748252,,,,,,,,,842216,,,,,,,,,,32195,,,,,,,,,,29306,,,,,,,,,,32077,,,,,,,,,,134330.74,,,,,,,,,,660744.23,,,,,,,,,,661098.56,,,,,,,,,,611212.48,,,,,,,,,,607481.88,,,,,,,,,,621207.63,,,,,,,,,,672637,,,,,,,,,,148465',
  'LUC,Contrato,Nome Fantasia,Leitura,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Rec. Fluxo,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Rec. Fluxo,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Rec. Fluxo,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Rec. Fluxo,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Coluna1,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Coluna1,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Coluna1,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Coluna1,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,Coluna1,Custo Total,,Leitura,Const. Medidor,Cons. Virtual,Ajuste,Consumo,Var (%),Custo R$,,Custo Total',
  '1001/1002,20000610,TRAMONTINA STORE,629313,633420,1,,,4107,0,2732.75,0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,1,,,0,0,0,,0,,651946,1,,,3750,0.11,2690.19,,2690.19,,655675,1,,,3729,0.09,2944.27,,2944.27,,659388,1,,,3713,-0.12,2577.97,,2577.97,,663170,1,,,3782,0.07,2762.90,,2762.90,,666669,1,,,3499,-0.09,2490.78,,2490.78,,670743,1,,,4074,0.15,2875.39,,2875.39,,,1,,,0,-1,0,,0',
  '1008,20000715,SEPHORA,123265,126766,1,,,3501,0,2329.52,0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,1,,,0,0,0,,0,,141848,1,,,2740,-0.08,1965.63,,1965.64,,141984,1,,,136,-0.94,107.38,,107.38,,142224,1,,,240,-1,166.63,,,,143857,1,,,1633,0,1192.97,,1192.97,,157438,1,1633,,1633,-0.02,1162.46,,1162.46,,171522,1,1633,,1633,-0.008,1152.55,,1152.55,,,1,,,0,-1,0,,0',
  '1011/1012,20000009,BROOKSFIELD,1245,1250,1000,,,5000,0,3326.94,0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,1000,,,0,0,0,,0,,1271,1000,,,4000,0.08,2869.53,,2869.54,,1275,1000,,,4000,0.10,3158.25,,3158.25,,1279,1000,,,4000,-0.12,2777.24,,2777.24,,1282,1000,,,3000,-0.21,2191.62,,2191.62,,1286,1000,,,4000,0.29,2847.43,,2847.43,,1290,1000,,,4000,-0.008,2823.16,,2823.16,,,1000,,,0,-1,0,,0',
  '2120,20000561,C&A,75680,76910,1,,,1230,0,818.42,0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,1,,,0,0,0,,0,,603,0,603,,603,0.08,432.58,,432.58,,,0,603,,603,0.10,476.10,,476.10,,,0,603,,603,-0.12,418.66,,418.66,,,0,603,,603,0.05,440.51,,440.51,,,0,603,,603,-0.02,429.25,,429.25,,,1,603,,603,-0.008,425.59,,425.59,,,1,,,0,-1,0,,0',
  'MULTIPLAN HALL,50001539,JIU-JITSU CHAMPIONSHIP,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,,,,,,,,',
  'MULTIPLAN HALL,50001540,CAFESTIVAL - 4ª EDIÇÃO,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,1,,,0,0,0,,0,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,'
].join('\n');

describe('spreadsheet-smart-parser', () => {
  it('detecta matriz horizontal anual (RATEIO ENERGIA 2026) com 35 linhas de resumo no topo e extrai Novembro corretamente', () => {
    const grid = parseTextToGrid(REAL_ENERGIA_2026_CSV);
    const result = extractSmartTableFromGrid(grid, {
      selectedMonth: '2026-11',
      utilityType: 'luz'
    });

    expect(result.headerRowIndex).toBe(36);
    expect(result.isMultiMonthMatrix).toBe(true);
    expect(result.detectedYear).toBe(2026);
    expect(result.detectedUtility).toBe('luz');
    expect(result.monthBlocks.length).toBe(13); // Anterior + Jan..Dez
    expect(result.selectedBlockId).toBe('11'); // Novembro
    expect(result.rows.length).toBe(6); // 6 lojas válidas (ignora linha vazia final)

    // Mapeamento automático de colunas
    expect(result.suggestedMappings['luc']).toBe('LUC');
    expect(result.suggestedMappings['contrato']).toBe('Contrato');
    expect(result.suggestedMappings['storeName']).toBe('Nome Fantasia');
    expect(result.suggestedMappings['reading']).toBe('Leitura');
    expect(result.suggestedMappings['prevReading']).toBe('Leitura Anterior (Outubro)');
    expect(result.suggestedMappings['constant']).toBe('Const. Medidor');
    expect(result.suggestedMappings['virtual']).toBe('Cons. Virtual');

    // Confere valores reais das lojas em Novembro
    const tramontina = result.rows.find(r => r['LUC'] === '1001/1002')!;
    expect(tramontina['Leitura']).toBe('670743');
    expect(tramontina['Leitura Anterior (Outubro)']).toBe('666669');
    expect(tramontina['Const. Medidor']).toBe('1');

    const brooksfield = result.rows.find(r => r['LUC'] === '1011/1012')!;
    expect(brooksfield['Leitura']).toBe('1290');
    expect(brooksfield['Const. Medidor']).toBe('1000');
    expect(brooksfield['Leitura Anterior (Outubro)']).toBe('1286');

    const sephora = result.rows.find(r => r['LUC'] === '1008')!;
    expect(sephora['Leitura']).toBe('171522');
    expect(sephora['Cons. Virtual']).toBe('1633');

    // Confere extração exata da fatura da concessionária, BSS1..4 e Ar-Condicionado de Novembro!
    expect(result.billSummary).not.toBeNull();
    expect(result.billSummary!.costItems.length).toBe(16);
    expect(result.billSummary!.totalBillFromItems).toBeCloseTo(786793.13, 2);
    expect(result.billSummary!.luzConsumption).toEqual({
      bss1: 994683.48,
      bss2: 56889.59,
      bss3: 44315.6,
      bss4: 18879.7
    });
    expect(result.billSummary!.totalConsumption).toBeCloseTo(1114768.37, 2);
    expect(result.billSummary!.acConsumption).toBe(162000);
  });

  it('permite trocar o bloco mensal para Outubro (10) na mesma planilha mestre', () => {
    const grid = parseTextToGrid(REAL_ENERGIA_2026_CSV);
    const result = extractSmartTableFromGrid(grid, {
      selectedMonth: '2026-11',
      requestedBlockId: '10',
      utilityType: 'luz'
    });

    expect(result.selectedBlockId).toBe('10');
    const tramontina = result.rows.find(r => r['LUC'] === '1001/1002')!;
    expect(tramontina['Leitura']).toBe('666669');
    expect(tramontina['Leitura Anterior (Setembro)']).toBe('663170');
    expect(result.billSummary!.totalBillFromItems).toBeCloseTo(723382.23, 2);
    expect(result.billSummary!.acConsumption).toBe(114000);
  });

  it('extrai lista mensal de lojas (Lojas -> Subir Lista Mensal) direto da planilha mestre desorganizada', () => {
    const grid = parseTextToGrid(REAL_ENERGIA_2026_CSV);
    const extracted = extractMonthlyStoreRowsFromGrid(grid);

    expect(extracted.usedSmartMatrixParser).toBe(true);
    expect(extracted.detectedHeaderRow).toBe(36);
    expect(extracted.detectedUtility).toBe('luz');
    expect(extracted.skippedLines).toHaveLength(0);
    expect(extracted.rows).toEqual([
      { luc: '1001/1002', contrato: '20000610', name: 'TRAMONTINA STORE' },
      { luc: '1008', contrato: '20000715', name: 'SEPHORA' },
      { luc: '1011/1012', contrato: '20000009', name: 'BROOKSFIELD' },
      { luc: '2120', contrato: '20000561', name: 'C&A' },
      { luc: 'MULTIPLAN HALL', contrato: '50001539', name: 'JIU-JITSU CHAMPIONSHIP' },
      { luc: 'MULTIPLAN HALL', contrato: '50001540', name: 'CAFESTIVAL - 4ª EDIÇÃO' }
    ]);
  });

  it('lida com planilha simples desorganizada (títulos no topo, cabeçalhos fora do padrão e linha TOTAL no final)', () => {
    const messyGrid = [
      ['SHOPPING BARRASHOPPINGSUL - CONTROLE DE ÁGUA'],
      ['Referência: Novembro / 2026'],
      [''],
      ['SUC', 'Lojista', 'Ponteiro', 'Obs.'],
      ['1001/1002', 'Tramontina', 1245, 'Ok'],
      ['1008', 'Sephora', 980, ''],
      ['TOTAL GERAL', '', 2225, '']
    ];

    const result = extractSmartTableFromGrid(messyGrid, { utilityType: 'agua' });
    expect(result.headerRowIndex).toBe(3);
    expect(result.isMultiMonthMatrix).toBe(false);
    expect(result.suggestedMappings['luc']).toBe('SUC');
    expect(result.suggestedMappings['storeName']).toBe('Lojista');
    expect(result.suggestedMappings['reading']).toBe('Ponteiro');
    expect(result.suggestedMappings['note']).toBe('Obs.');
    expect(result.rows.length).toBe(2); // TOTAL GERAL ignorado
    expect(result.ignoredNoiseRows).toBe(1);
  });

  it('infere colunas pelo conteúdo quando a planilha não tem cabeçalho', () => {
    const knownStores: Store[] = [
      { id: 's1', luc: '1001', name: 'TRAMONTINA', contrato: '20000610', active: true, usesLuz: true },
      { id: 's2', luc: '1008', name: 'SEPHORA', contrato: '20000715', active: true, usesLuz: true },
      { id: 's3', luc: '2120', name: 'C&A', contrato: '20000561', active: true, usesLuz: true }
    ];

    const headerlessGrid = [
      ['1001', 'TRAMONTINA', 670743],
      ['1008', 'SEPHORA', 171522],
      ['2120', 'C&A', 76910]
    ];

    const result = extractSmartTableFromGrid(headerlessGrid, { knownStores });
    expect(result.headerRowIndex).toBe(-1);
    expect(result.suggestedMappings['luc']).toBe('Coluna 1');
    expect(result.suggestedMappings['storeName']).toBe('Coluna 2');
    expect(result.suggestedMappings['reading']).toBe('Coluna 3');
  });

  it('seleciona automaticamente a aba certa em um workbook com múltiplas abas (Resumo, Água, Energia, Gás)', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Resumo Geral']]), 'Resumo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LUC', 'Loja', 'Leitura'], ['101', 'A', 50]]), 'Água 2026');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LUC', 'Loja', 'Leitura'], ['101', 'A', 5000]]), 'Energia 2026');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LUC', 'Loja', 'Leitura'], ['101', 'A', 25]]), 'Gás 2026');

    const sheets = extractSheetsFromWorkbook(wb);
    expect(chooseBestSheetIndex(sheets, 'agua')).toBe(1);
    expect(chooseBestSheetIndex(sheets, 'luz')).toBe(2);
    expect(chooseBestSheetIndex(sheets, 'gas')).toBe(3);
  });
});
