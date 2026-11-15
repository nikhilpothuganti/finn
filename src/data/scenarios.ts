import type { Category, Filing } from "@/lib/types";

// SCENARIO FILINGS — fictional announcements injected (and labelled "Scenario" in the UI) so the
// demo can show the management-change, M&A, litigation and capex flows even on a day when the
// live feed has none. They reference the synthetic people in data/network.ts. Toggle off in Settings.

export interface ScenarioFiling extends Filing {
  scenario: true;
  category: Category;
  person?: string; // name of the person the filing is about
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export function scenarioFilings(): ScenarioFiling[] {
  return [
    {
      id: "scn-dixon-cfo", symbol: "DIXON", scenario: true, category: "management_change", person: "Rohan Kulkarni",
      title: "Change in Key Managerial Personnel – Appointment of Mr. Rohan Kulkarni as Chief Financial Officer",
      summary: "Board appoints Rohan Kulkarni, currently Deputy CFO at Kaynes Technology, as CFO w.e.f. 1 Dec 2026; outgoing CFO steps down to pursue other interests.",
      url: "#scenario", at: hoursAgo(3),
    },
    {
      id: "scn-pi-acq", symbol: "PIIND", scenario: true, category: "M&A",
      title: "Acquisition – PI Industries to acquire 100% of a European biologicals company",
      summary: "Wholly-owned subsidiary to acquire a Netherlands-based crop biologicals business for €180 mn (~₹1,650 cr), funded from internal accruals; closing expected Q4 FY27.",
      url: "#scenario", at: hoursAgo(7),
    },
    {
      id: "scn-sun-wl", symbol: "SUNPHARMA", scenario: true, category: "litigation",
      title: "Receipt of Warning Letter from USFDA for Halol facility",
      summary: "USFDA issues a warning letter for the Halol (Gujarat) plant following its inspection; existing supplies continue, new approvals from the site may be withheld.",
      url: "#scenario", at: hoursAgo(14),
    },
    {
      id: "scn-aavas-md", symbol: "AAVAS", scenario: true, category: "management_change", person: "Vivek Chandra",
      title: "Appointment of Mr. Vivek Chandra as Managing Director & CEO",
      summary: "Board appoints Vivek Chandra, President – Home Loans at Cholamandalam Finance, as MD & CEO for five years, subject to shareholder approval.",
      url: "#scenario", at: hoursAgo(20),
    },
    {
      id: "scn-polycab-capex", symbol: "POLYCAB", scenario: true, category: "capex",
      title: "Board approves capital expenditure for new cables & wires capacity",
      summary: "Board approves ₹1,500 cr capex over FY27–29 for a greenfield cables & wires plant in Gujarat, raising capacity ~25%.",
      url: "#scenario", at: hoursAgo(30),
    },
  ];
}
