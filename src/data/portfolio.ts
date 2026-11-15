// The demo investor's book. Mixed by sector and size on purpose: mega-cap banks and IT,
// mid-cap specialty chemicals and electronics manufacturing, small-cap rural lending.
export const PORTFOLIO = [
  "HDFCBANK", "TCS", "RELIANCE", "BAJFINANCE", "ASIANPAINT", "TITAN", "SUNPHARMA", "LT", "MARUTI",
  "DIXON", "KAYNES", "PIIND", "DEEPAKNTR", "NAVINFLUOR", "POLYCAB", "TRENT", "AAVAS", "CHOLAFIN",
] as const;

// Companies to demo on-demand research on (outside the book). The engine works on any NSE symbol.
export const RESEARCH_SET = ["PERSISTENT", "SRF", "CDSL", "KPITTECH", "CGPOWER"] as const;

// Human names for orgs the network references, so a person's "Infosys" stint can be matched to
// a listed symbol and to Screener's peer lists.
export const ORG_SYMBOL: Record<string, string> = {
  "HDFC Bank": "HDFCBANK", TCS: "TCS", "Tata Consultancy Services": "TCS", "Reliance Industries": "RELIANCE",
  "Reliance Jio": "RELIANCE", "Bajaj Finance": "BAJFINANCE", "Asian Paints": "ASIANPAINT", Titan: "TITAN",
  "Sun Pharma": "SUNPHARMA", "Larsen & Toubro": "LT", "Maruti Suzuki": "MARUTI", "Dixon Technologies": "DIXON",
  "Kaynes Technology": "KAYNES", "PI Industries": "PIIND", "Deepak Nitrite": "DEEPAKNTR",
  "Navin Fluorine": "NAVINFLUOR", Polycab: "POLYCAB", Trent: "TRENT", "Aavas Financiers": "AAVAS",
  "Cholamandalam Finance": "CHOLAFIN", Infosys: "INFY", Wipro: "WIPRO", "HCL Technologies": "HCLTECH",
  "ICICI Bank": "ICICIBANK", "Kotak Mahindra Bank": "KOTAKBANK", "Axis Bank": "AXISBANK", UPL: "UPL",
  SRF: "SRF", "Aarti Industries": "AARTIIND", "Gujarat Fluorochemicals": "FLUOROCHEM", Havells: "HAVELLS",
  "KEI Industries": "KEI", "Berger Paints": "BERGEPAINT", "Lupin": "LUPIN", "Dr. Reddy's": "DRREDDY",
  "Tata Motors": "TATAMOTORS", "Mahindra & Mahindra": "M&M", "Persistent Systems": "PERSISTENT",
  "KPIT Technologies": "KPITTECH", CDSL: "CDSL", "CG Power": "CGPOWER", "Amber Enterprises": "AMBER",
  "Syrma SGS": "SYRMA", "Aptus Value Housing": "APTUS", "Home First Finance": "HOMEFIRST",
  "Shriram Finance": "SHRIRAMFIN", "Avenue Supermarts": "DMART", "Bharat Forge": "BHARATFORG",
  "Kotak Institutional Equities": "KOTAKBANK",
};
