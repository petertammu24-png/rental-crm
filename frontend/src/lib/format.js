export const formatINR = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};

export const formatDate = (isoDate) => {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const statusTone = (status) => {
  switch (status) {
    case "Booked":
      return "bg-[#3A2A5E] text-[#E9CFFD] border border-[#5A3D85]";
    case "Delivered":
      return "bg-[#2E3D5C] text-[#BFD1F5] border border-[#3F5582]";
    case "Returned":
      return "bg-[#22463A] text-[#A6E8C9] border border-[#3A6E58]";
    case "Overdue":
      return "bg-[#5C1F2C] text-[#FDB3C0] border border-[#7E2C3E]";
    default:
      return "bg-[#3A2A5E] text-[#E9CFFD] border border-[#5A3D85]";
  }
};

export const roleLabel = (role) => {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "manager":
      return "Manager";
    case "staff":
      return "Staff";
    default:
      return role || "—";
  }
};
