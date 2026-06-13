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
      return "bg-[#FDF6E3] text-[#7A5C00] border border-[#F0E5BF]";
    case "Delivered":
      return "bg-[#E8EDF2] text-[#142945] border border-[#CFD7E2]";
    case "Returned":
      return "bg-[#E8F3EE] text-[#1C4A32] border border-[#BFDDCA]";
    case "Overdue":
      return "bg-[#F9EAEB] text-[#7A1A1E] border border-[#E7C2C4]";
    default:
      return "bg-[#F4EFE3] text-[#4A4A4A] border border-[#E6DFCE]";
  }
};
