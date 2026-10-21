/**
 * Official Philippine Standard Geographic Code (PSGC) / OCHA Administrative Level 4
 * Polygon Centroid Coordinates for all 189 Barangays across Rizal Province.
 * Derived from verified NAMRIA/PSA geographic boundary shapes.
 */

import { MUNICIPALITY_COORDINATES } from "../types/report";
import { calculateDistanceMeters } from "./geohash";

export const RIZAL_BARANGAY_COORDINATES: Record<string, Record<string, { lat: number; lng: number }>> = {
  "Angono": {
    "Bagumbayan": {
      "lat": 14.5175,
      "lng": 121.1485
    },
    "Kalayaan": {
      "lat": 14.5302,
      "lng": 121.1458
    },
    "Poblacion Ibaba": {
      "lat": 14.5193,
      "lng": 121.147
    },
    "Poblacion Itaas": {
      "lat": 14.5238,
      "lng": 121.151
    },
    "San Isidro": {
      "lat": 14.5414,
      "lng": 121.1611
    },
    "San Pedro": {
      "lat": 14.5222,
      "lng": 121.1514
    },
    "San Roque": {
      "lat": 14.5344,
      "lng": 121.1733
    },
    "San Vicente": {
      "lat": 14.5213,
      "lng": 121.146
    },
    "Santo Niño": {
      "lat": 14.5252,
      "lng": 121.1505
    },
    "Mahabang Parang": {
      "lat": 14.5458,
      "lng": 121.1863
    }
  },
  "Antipolo City": {
    "Calawis": {
      "lat": 14.7097,
      "lng": 121.2681
    },
    "Cupang": {
      "lat": 14.6406,
      "lng": 121.1525
    },
    "Dela Paz (Pob.)": {
      "lat": 14.6016,
      "lng": 121.1669
    },
    "Dela Paz": {
      "lat": 14.6016,
      "lng": 121.1669
    },
    "Mayamot": {
      "lat": 14.6267,
      "lng": 121.122
    },
    "San Isidro (Pob.)": {
      "lat": 14.5995,
      "lng": 121.1859
    },
    "San Isidro": {
      "lat": 14.5995,
      "lng": 121.1859
    },
    "San Jose (Pob.)": {
      "lat": 14.6372,
      "lng": 121.2661
    },
    "San Jose": {
      "lat": 14.6372,
      "lng": 121.2661
    },
    "San Roque (Pob.)": {
      "lat": 14.5686,
      "lng": 121.1714
    },
    "San Roque": {
      "lat": 14.5686,
      "lng": 121.1714
    },
    "Mambugan": {
      "lat": 14.6164,
      "lng": 121.1377
    },
    "Bagong Nayon": {
      "lat": 14.629,
      "lng": 121.1626
    },
    "Beverly Hills": {
      "lat": 14.5798,
      "lng": 121.1601
    },
    "Dalig": {
      "lat": 14.5705,
      "lng": 121.1909
    },
    "Inarawan": {
      "lat": 14.6304,
      "lng": 121.2092
    },
    "San Juan": {
      "lat": 14.6478,
      "lng": 121.1944
    },
    "San Luis": {
      "lat": 14.6098,
      "lng": 121.1974
    },
    "Santa Cruz": {
      "lat": 14.6101,
      "lng": 121.1588
    },
    "Muntingdilaw": {
      "lat": 14.6011,
      "lng": 121.134
    },
    "Muntindilaw": {
      "lat": 14.6011,
      "lng": 121.134
    }
  },
  "Baras": {
    "Evangelista": {
      "lat": 14.5145,
      "lng": 121.2725
    },
    "Rizal (Pob.)": {
      "lat": 14.5273,
      "lng": 121.2655
    },
    "Rizal": {
      "lat": 14.5273,
      "lng": 121.2655
    },
    "San Jose": {
      "lat": 14.5358,
      "lng": 121.2698
    },
    "San Salvador": {
      "lat": 14.5613,
      "lng": 121.2686
    },
    "Santiago": {
      "lat": 14.5135,
      "lng": 121.2633
    },
    "Concepcion": {
      "lat": 14.5238,
      "lng": 121.2775
    },
    "San Juan": {
      "lat": 14.5475,
      "lng": 121.2845
    },
    "San Miguel": {
      "lat": 14.5236,
      "lng": 121.2733
    },
    "Mabini": {
      "lat": 14.5112,
      "lng": 121.2668
    },
    "Pinugay": {
      "lat": 14.6022,
      "lng": 121.2804
    }
  },
  "Binangonan": {
    "Bangad": {
      "lat": 14.3692,
      "lng": 121.2271
    },
    "Batingan": {
      "lat": 14.474,
      "lng": 121.1995
    },
    "Bilibiran": {
      "lat": 14.4992,
      "lng": 121.1731
    },
    "Binitagan": {
      "lat": 14.3144,
      "lng": 121.2298
    },
    "Bombong": {
      "lat": 14.3917,
      "lng": 121.2229
    },
    "Buhangin": {
      "lat": 14.3616,
      "lng": 121.2266
    },
    "Calumpang": {
      "lat": 14.4747,
      "lng": 121.1884
    },
    "Ginoong Sanay": {
      "lat": 14.3197,
      "lng": 121.2277
    },
    "Gulod": {
      "lat": 14.3461,
      "lng": 121.222
    },
    "Habagatan": {
      "lat": 14.2967,
      "lng": 121.2362
    },
    "Ithan": {
      "lat": 14.43,
      "lng": 121.2126
    },
    "Janosa": {
      "lat": 14.3543,
      "lng": 121.2228
    },
    "Kalawaan": {
      "lat": 14.5013,
      "lng": 121.1959
    },
    "Kalinawan": {
      "lat": 14.4249,
      "lng": 121.2119
    },
    "Kasile": {
      "lat": 14.3978,
      "lng": 121.2224
    },
    "Kaytome": {
      "lat": 14.3498,
      "lng": 121.2238
    },
    "Kinaboogan": {
      "lat": 14.3782,
      "lng": 121.2257
    },
    "Kinagatan": {
      "lat": 14.3852,
      "lng": 121.2259
    },
    "Libis (Pob.)": {
      "lat": 14.4641,
      "lng": 121.1899
    },
    "Libis": {
      "lat": 14.4641,
      "lng": 121.1899
    },
    "Limbon-limbon": {
      "lat": 14.4396,
      "lng": 121.2058
    },
    "Lunsad": {
      "lat": 14.4565,
      "lng": 121.1987
    },
    "Mahabang Parang": {
      "lat": 14.4661,
      "lng": 121.2106
    },
    "Macamot": {
      "lat": 14.4887,
      "lng": 121.1987
    },
    "Mambog": {
      "lat": 14.4801,
      "lng": 121.2134
    },
    "Palangoy": {
      "lat": 14.518,
      "lng": 121.1895
    },
    "Pantok": {
      "lat": 14.5195,
      "lng": 121.1956
    },
    "Pila Pila": {
      "lat": 14.4463,
      "lng": 121.2087
    },
    "Pila-pila": {
      "lat": 14.4463,
      "lng": 121.2087
    },
    "Pinagdilawan": {
      "lat": 14.3282,
      "lng": 121.2255
    },
    "Pipindan": {
      "lat": 14.4162,
      "lng": 121.2144
    },
    "Rayap": {
      "lat": 14.3095,
      "lng": 121.2374
    },
    "Sapang": {
      "lat": 14.3396,
      "lng": 121.2237
    },
    "Tabon": {
      "lat": 14.3071,
      "lng": 121.232
    },
    "Tagpos": {
      "lat": 14.5153,
      "lng": 121.1762
    },
    "Tatala": {
      "lat": 14.4879,
      "lng": 121.2083
    },
    "Tayuman": {
      "lat": 14.5212,
      "lng": 121.1705
    },
    "Layunan (Pob.)": {
      "lat": 14.4678,
      "lng": 121.1931
    },
    "Layunan": {
      "lat": 14.4678,
      "lng": 121.1931
    },
    "Libid (Pob.)": {
      "lat": 14.4639,
      "lng": 121.1959
    },
    "Libid": {
      "lat": 14.4639,
      "lng": 121.1959
    },
    "Malakaban": {
      "lat": 14.3332,
      "lng": 121.2239
    },
    "Pag-Asa": {
      "lat": 14.5237,
      "lng": 121.1599
    },
    "Pag-asa": {
      "lat": 14.5237,
      "lng": 121.1599
    },
    "San Carlos": {
      "lat": 14.5165,
      "lng": 121.1695
    }
  },
  "Cainta": {
    "San Andres (Pob.)": {
      "lat": 14.565,
      "lng": 121.1083
    },
    "San Andres": {
      "lat": 14.565,
      "lng": 121.1083
    },
    "San Isidro": {
      "lat": 14.6067,
      "lng": 121.1166
    },
    "San Juan": {
      "lat": 14.5797,
      "lng": 121.1271
    },
    "San Roque": {
      "lat": 14.5726,
      "lng": 121.1167
    },
    "Santa Rosa": {
      "lat": 14.579,
      "lng": 121.1168
    },
    "Santo Niño": {
      "lat": 14.5825,
      "lng": 121.12
    },
    "Santo Domingo": {
      "lat": 14.5943,
      "lng": 121.1157
    }
  },
  "Cardona": {
    "Balibago": {
      "lat": 14.3243,
      "lng": 121.237
    },
    "Boor": {
      "lat": 14.3617,
      "lng": 121.2341
    },
    "Calahan": {
      "lat": 14.4956,
      "lng": 121.2339
    },
    "Dalig": {
      "lat": 14.4769,
      "lng": 121.2321
    },
    "Del Remedio (Pob.)": {
      "lat": 14.4913,
      "lng": 121.2273
    },
    "Del Remedio": {
      "lat": 14.4913,
      "lng": 121.2273
    },
    "Iglesia (Pob.)": {
      "lat": 14.4987,
      "lng": 121.2171
    },
    "Iglesia": {
      "lat": 14.4987,
      "lng": 121.2171
    },
    "Lambac": {
      "lat": 14.3443,
      "lng": 121.2425
    },
    "Looc": {
      "lat": 14.4772,
      "lng": 121.2229
    },
    "Malanggam-Calubacan": {
      "lat": 14.3858,
      "lng": 121.2324
    },
    "Nagsulo": {
      "lat": 14.4373,
      "lng": 121.2177
    },
    "Navotas": {
      "lat": 14.4146,
      "lng": 121.2263
    },
    "Patunhay": {
      "lat": 14.4861,
      "lng": 121.2322
    },
    "Real (Pob.)": {
      "lat": 14.4852,
      "lng": 121.2311
    },
    "Real": {
      "lat": 14.4852,
      "lng": 121.2311
    },
    "Sampad": {
      "lat": 14.4524,
      "lng": 121.2193
    },
    "San Roque (Pob.)": {
      "lat": 14.4819,
      "lng": 121.2281
    },
    "San Roque": {
      "lat": 14.4819,
      "lng": 121.2281
    },
    "Subay": {
      "lat": 14.4044,
      "lng": 121.2279
    },
    "Ticulio": {
      "lat": 14.4239,
      "lng": 121.2191
    },
    "Tuna": {
      "lat": 14.3371,
      "lng": 121.2437
    },
    "Ocampo": {
      "lat": 14.4842,
      "lng": 121.2311
    }
  },
  "Jalajala": {
    "Bagumbong": {
      "lat": 14.3551,
      "lng": 121.3579
    },
    "Bayugo": {
      "lat": 14.3205,
      "lng": 121.3141
    },
    "Second District (Pob.)": {
      "lat": 14.3505,
      "lng": 121.3273
    },
    "Second District": {
      "lat": 14.3505,
      "lng": 121.3273
    },
    "Lukang": {
      "lat": 14.3505,
      "lng": 121.3273
    },
    "Special District": {
      "lat": 14.3563,
      "lng": 121.3286
    },
    "Third District (Pob.)": {
      "lat": 14.3418,
      "lng": 121.3277
    },
    "Third District": {
      "lat": 14.3418,
      "lng": 121.3277
    },
    "Lubo": {
      "lat": 14.3331,
      "lng": 121.3466
    },
    "Pagkalinawan": {
      "lat": 14.3173,
      "lng": 121.3328
    },
    "Palaypalay": {
      "lat": 14.3021,
      "lng": 121.3209
    },
    "Punta": {
      "lat": 14.2941,
      "lng": 121.3108
    },
    "Sipsipin": {
      "lat": 14.3704,
      "lng": 121.3376
    },
    "Special District (Pob.)": {
      "lat": 14.3563,
      "lng": 121.3286
    },
    "Paalaman": {
      "lat": 14.3531,
      "lng": 121.3389
    }
  },
  "Rodriguez (Montalban)": {
    "Balite (Pob.)": {
      "lat": 14.7311,
      "lng": 121.1463
    },
    "Balite": {
      "lat": 14.7311,
      "lng": 121.1463
    },
    "Burgos": {
      "lat": 14.7164,
      "lng": 121.1397
    },
    "Geronimo": {
      "lat": 14.7317,
      "lng": 121.1499
    },
    "Macabud": {
      "lat": 14.7829,
      "lng": 121.1346
    },
    "Manggahan": {
      "lat": 14.7236,
      "lng": 121.1453
    },
    "Mascap": {
      "lat": 14.7465,
      "lng": 121.2109
    },
    "Puray": {
      "lat": 14.7975,
      "lng": 121.2691
    },
    "Rosario": {
      "lat": 14.7303,
      "lng": 121.143
    },
    "San Isidro": {
      "lat": 14.7865,
      "lng": 121.1742
    },
    "San Jose": {
      "lat": 14.7412,
      "lng": 121.1316
    },
    "San Rafael": {
      "lat": 14.7169,
      "lng": 121.1923
    }
  },
  "Morong": {
    "Bombongan": {
      "lat": 14.5082,
      "lng": 121.2186
    },
    "Can-Cal-Lan (Caniogan-Calero-Lanang)": {
      "lat": 14.5289,
      "lng": 121.2485
    },
    "Can-Cal-Lan": {
      "lat": 14.5289,
      "lng": 121.2485
    },
    "Lagundi": {
      "lat": 14.5516,
      "lng": 121.2519
    },
    "Maybancal": {
      "lat": 14.5487,
      "lng": 121.2397
    },
    "San Guillermo": {
      "lat": 14.5243,
      "lng": 121.2172
    },
    "San Jose (Pob.)": {
      "lat": 14.5144,
      "lng": 121.2296
    },
    "San Jose": {
      "lat": 14.5144,
      "lng": 121.2296
    },
    "San Juan (Pob.)": {
      "lat": 14.5151,
      "lng": 121.2461
    },
    "San Juan": {
      "lat": 14.5151,
      "lng": 121.2461
    },
    "San Pedro (Pob.)": {
      "lat": 14.5057,
      "lng": 121.2413
    },
    "San Pedro": {
      "lat": 14.5057,
      "lng": 121.2413
    }
  },
  "Pililla": {
    "Bagumbayan (Pob.)": {
      "lat": 14.4814,
      "lng": 121.3354
    },
    "Bagumbayan": {
      "lat": 14.4814,
      "lng": 121.3354
    },
    "Halayhayin": {
      "lat": 14.462,
      "lng": 121.3489
    },
    "Hulo (Pob.)": {
      "lat": 14.4991,
      "lng": 121.3344
    },
    "Hulo": {
      "lat": 14.4991,
      "lng": 121.3344
    },
    "Imatong (Pob.)": {
      "lat": 14.4825,
      "lng": 121.307
    },
    "Imatong": {
      "lat": 14.4825,
      "lng": 121.307
    },
    "Malaya": {
      "lat": 14.39,
      "lng": 121.3515
    },
    "Niogan": {
      "lat": 14.4061,
      "lng": 121.3515
    },
    "Quisao": {
      "lat": 14.4308,
      "lng": 121.3495
    },
    "Wawa (Pob.)": {
      "lat": 14.4781,
      "lng": 121.3077
    },
    "Wawa": {
      "lat": 14.4781,
      "lng": 121.3077
    },
    "Takungan (Pob.)": {
      "lat": 14.4824,
      "lng": 121.3044
    },
    "Takungan": {
      "lat": 14.4824,
      "lng": 121.3044
    }
  },
  "San Mateo": {
    "Ampid I": {
      "lat": 14.6794,
      "lng": 121.1211
    },
    "Dulong Bayan 1": {
      "lat": 14.7051,
      "lng": 121.1211
    },
    "Dulong Bayan 2": {
      "lat": 14.6907,
      "lng": 121.1441
    },
    "Guinayang": {
      "lat": 14.7046,
      "lng": 121.1349
    },
    "Guitnang Bayan I (Pob.)": {
      "lat": 14.6822,
      "lng": 121.1368
    },
    "Guitnang Bayan I": {
      "lat": 14.6822,
      "lng": 121.1368
    },
    "Guitnang Bayan II (Pob.)": {
      "lat": 14.6862,
      "lng": 121.1424
    },
    "Guitnang Bayan II": {
      "lat": 14.6862,
      "lng": 121.1424
    },
    "Malanday": {
      "lat": 14.6973,
      "lng": 121.1498
    },
    "Maly": {
      "lat": 14.7058,
      "lng": 121.15
    },
    "Santa Ana": {
      "lat": 14.6904,
      "lng": 121.1132
    },
    "Ampid II": {
      "lat": 14.6858,
      "lng": 121.1175
    },
    "Banaba": {
      "lat": 14.6745,
      "lng": 121.1174
    },
    "Gulod Malaya": {
      "lat": 14.6766,
      "lng": 121.1301
    },
    "Pintong Bocawe": {
      "lat": 14.6841,
      "lng": 121.1893
    },
    "Santo Niño": {
      "lat": 14.6694,
      "lng": 121.1331
    },
    "Silangan": {
      "lat": 14.6611,
      "lng": 121.1496
    }
  },
  "Tanay": {
    "Cayabu": {
      "lat": 14.6624,
      "lng": 121.3395
    },
    "Cuyambay": {
      "lat": 14.598,
      "lng": 121.3405
    },
    "Daraitan": {
      "lat": 14.5947,
      "lng": 121.4268
    },
    "Katipunan-Bayan (Pob.)": {
      "lat": 14.5055,
      "lng": 121.2846
    },
    "Katipunan-Bayan": {
      "lat": 14.5055,
      "lng": 121.2846
    },
    "Kaybuto (Pob.)": {
      "lat": 14.5033,
      "lng": 121.2785
    },
    "Kaybuto": {
      "lat": 14.5033,
      "lng": 121.2785
    },
    "Laiban": {
      "lat": 14.6065,
      "lng": 121.3958
    },
    "Mag-Ampon (Pob.)": {
      "lat": 14.4994,
      "lng": 121.2865
    },
    "Mag-Ampon": {
      "lat": 14.4994,
      "lng": 121.2865
    },
    "Mamuyao": {
      "lat": 14.6784,
      "lng": 121.3806
    },
    "Pinagkamaligan (Pob.)": {
      "lat": 14.495,
      "lng": 121.284
    },
    "Pinagkamaligan": {
      "lat": 14.495,
      "lng": 121.284
    },
    "Plaza Aldea (Pob.)": {
      "lat": 14.5294,
      "lng": 121.3294
    },
    "Plaza Aldea": {
      "lat": 14.5294,
      "lng": 121.3294
    },
    "Sampaloc": {
      "lat": 14.5503,
      "lng": 121.3884
    },
    "San Andres": {
      "lat": 14.636,
      "lng": 121.3433
    },
    "San Isidro (Pob.)": {
      "lat": 14.4955,
      "lng": 121.2807
    },
    "San Isidro": {
      "lat": 14.4955,
      "lng": 121.2807
    },
    "Santa Inez": {
      "lat": 14.7223,
      "lng": 121.3353
    },
    "Sta. Ines": {
      "lat": 14.7223,
      "lng": 121.3353
    },
    "Santo Niño": {
      "lat": 14.6512,
      "lng": 121.3577
    },
    "Sto. Niño": {
      "lat": 14.6512,
      "lng": 121.3577
    },
    "Tabing Ilog (Pob.)": {
      "lat": 14.4979,
      "lng": 121.2858
    },
    "Tabing Ilog": {
      "lat": 14.4979,
      "lng": 121.2858
    },
    "Tandang Kutyo (Pob.)": {
      "lat": 14.545,
      "lng": 121.3071
    },
    "Tandang Kutyo": {
      "lat": 14.545,
      "lng": 121.3071
    },
    "Tinucan": {
      "lat": 14.68,
      "lng": 121.3411
    },
    "Wawa (Pob.)": {
      "lat": 14.4876,
      "lng": 121.2848
    },
    "Wawa": {
      "lat": 14.4876,
      "lng": 121.2848
    },
    "Madilay-dilay": {
      "lat": 14.5699,
      "lng": 121.4414
    }
  },
  "Taytay": {
    "Dolores (Pob.)": {
      "lat": 14.5745,
      "lng": 121.1495
    },
    "Dolores": {
      "lat": 14.5745,
      "lng": 121.1495
    },
    "Muzon": {
      "lat": 14.5474,
      "lng": 121.1491
    },
    "San Isidro": {
      "lat": 14.5796,
      "lng": 121.1358
    },
    "San Juan": {
      "lat": 14.5492,
      "lng": 121.1312
    },
    "Santa Ana": {
      "lat": 14.5366,
      "lng": 121.1129
    }
  },
  "Teresa": {
    "Bagumbayan": {
      "lat": 14.5532,
      "lng": 121.2239
    },
    "Dalig": {
      "lat": 14.5725,
      "lng": 121.2312
    },
    "Dulumbayan": {
      "lat": 14.5487,
      "lng": 121.2018
    },
    "May-Iba": {
      "lat": 14.568,
      "lng": 121.2093
    },
    "May-iba": {
      "lat": 14.568,
      "lng": 121.2093
    },
    "Poblacion": {
      "lat": 14.5614,
      "lng": 121.2036
    },
    "Prinza": {
      "lat": 14.5408,
      "lng": 121.2164
    },
    "San Gabriel": {
      "lat": 14.5553,
      "lng": 121.2115
    },
    "San Roque": {
      "lat": 14.5495,
      "lng": 121.2146
    },
    "Calumpang Santo Cristo": {
      "lat": 14.5563,
      "lng": 121.2074
    }
  }
};

/**
 * Normalizes a barangay or municipality name for fuzzy matching against the dictionary
 */
function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .replace(/^brgy\.?\s+/i, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\bsta\.?\b/gi, "santa")
    .replace(/\bsto\.?\b/gi, "santo")
    .replace(/inez\b/gi, "ines")
    .replace(/[-_\s]+/g, "")
    .trim();
}

/**
 * Returns the geographic centroid coordinates for a given municipality and barangay.
 * Supports exact name matching, stripped names (e.g. without (Pob.)), and fuzzy normalization.
 */
export function getBarangayCoordinates(
  municipality?: string | null,
  barangay?: string | null
): { lat: number; lng: number } | null {
  if (!municipality) return null;

  // Normalize municipality key
  let munKey = municipality;
  if (!RIZAL_BARANGAY_COORDINATES[munKey]) {
    const foundMun = Object.keys(RIZAL_BARANGAY_COORDINATES).find(
      (m) => normalizeName(m) === normalizeName(municipality)
    );
    if (foundMun) munKey = foundMun;
  }

  const munData = RIZAL_BARANGAY_COORDINATES[munKey];
  if (!munData) {
    return MUNICIPALITY_COORDINATES[municipality] || null;
  }

  if (barangay) {
    // 1. Direct match
    if (munData[barangay]) {
      return munData[barangay];
    }

    // 2. Clean prefix or suffix match
    const cleanBrgy = barangay.replace(/^Brgy\.?\s+/i, "").replace(/\s*\([^)]*\)/g, "").trim();
    if (munData[cleanBrgy]) {
      return munData[cleanBrgy];
    }

    // 3. Normalized fuzzy match
    const normSearch = normalizeName(barangay);
    const foundBrgy = Object.keys(munData).find(
      (b) => normalizeName(b) === normSearch
    );
    if (foundBrgy) {
      return munData[foundBrgy];
    }
  }

  if (MUNICIPALITY_COORDINATES[municipality]) {
    return MUNICIPALITY_COORDINATES[municipality];
  }

  return null;
}

/**
 * Normalizes an incident report coordinates to its true Barangay centroid:
 * - If location source is GPS with non-zero lat/lng, preserves physical GPS.
 * - If coordinates match the generic municipality center or manual pin,
 *   snaps to the verified Barangay centroid.
 */
export function resolveReportCoordinates(report: {
  location: {
    lat: number;
    lng: number;
    source?: string;
    municipality?: string;
    barangay?: string;
  };
  rawInput?: {
    exif?: {
      latitude?: number | null;
      longitude?: number | null;
    } | null;
  };
}): { lat: number; lng: number } {
  if (!report || !report.location) {
    return { lat: 14.58, lng: 121.28 };
  }

  const { lat, lng, source, municipality, barangay } = report.location;

  // 1. If photo has authentic camera hardware EXIF GPS, prioritize true physical camera location
  if (
    report.rawInput?.exif?.latitude &&
    report.rawInput?.exif?.longitude &&
    !isNaN(report.rawInput.exif.latitude) &&
    !isNaN(report.rawInput.exif.longitude)
  ) {
    return {
      lat: report.rawInput.exif.latitude,
      lng: report.rawInput.exif.longitude,
    };
  }

  // 2. If phone GPS captured coordinates, preserve exact physical position
  if (source === "gps" && lat && lng) {
    return { lat, lng };
  }

  // 3. If municipality and barangay are specified, check if coordinates are at the generic municipality center
  if (municipality && barangay) {
    const brgyCoords = getBarangayCoordinates(municipality, barangay);
    if (brgyCoords) {
      const munCoords = MUNICIPALITY_COORDINATES[municipality];
      const isAtMunCenter =
        munCoords &&
        Math.abs(lat - munCoords.lat) < 0.005 &&
        Math.abs(lng - munCoords.lng) < 0.005;

      if (!lat || !lng || isAtMunCenter) {
        return brgyCoords;
      }
    }
  }

  // 4. Return physical/user pin if available
  if (lat && lng) {
    return { lat, lng };
  }

  // 5. Fallback to barangay centroid if available
  if (municipality && barangay) {
    const brgyCoords = getBarangayCoordinates(municipality, barangay);
    if (brgyCoords) return brgyCoords;
  }

  return { lat: lat || 14.58, lng: lng || 121.28 };
}

/**
 * Reverse-geocodes given lat/lng to find the nearest Rizal Municipality and Barangay.
 * Useful for auto-detecting barangays when a citizen reports via GPS.
 */
export function findNearestBarangay(
  lat: number,
  lng: number
): { municipality: string; barangay: string; distanceMeters: number } | null {
  let closest: { municipality: string; barangay: string; distanceMeters: number } | null = null;
  let minDistance = Infinity;

  for (const [municipality, barangays] of Object.entries(RIZAL_BARANGAY_COORDINATES)) {
    for (const [barangay, coords] of Object.entries(barangays)) {
      const dist = calculateDistanceMeters(lat, lng, coords.lat, coords.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { municipality, barangay, distanceMeters: Math.round(dist) };
      }
    }
  }

  if (closest && closest.distanceMeters <= 15000) {
    return closest;
  }

  return null;
}
