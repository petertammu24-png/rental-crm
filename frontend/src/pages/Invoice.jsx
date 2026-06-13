import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";

export default function Invoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [branch, setBranch] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await apiClient.get(`/bookings/${id}`);
        setBooking(data);
        if (data.branch_id) {
          const branches = await apiClient.get("/branches");
          setBranch(branches.data.find((b) => b.id === data.branch_id) || null);
        }
      } catch {
        setError("Invoice not found");
      }
    };
    load();
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#251638] text-[#FDB3C0]">
        {error}
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#251638] text-[#B097D1]">
        Loading…
      </div>
    );
  }

  const rentalDue =
    Number(booking.rental_amount || 0) - Number(booking.advance_paid || 0);

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
        .print-page { color: #1F1F1F; }
        .print-page h1, .print-page h2, .print-page h3 { color: #1F1F1F; }
      `}</style>

      <div className="min-h-screen bg-[#251638] py-8 px-4">
        {/* Action bar */}
        <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between no-print">
          <button
            onClick={() => navigate(-1)}
            className="neu-btn px-4 py-2 text-sm inline-flex items-center gap-2"
            data-testid="invoice-back"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={() => window.print()}
            className="neu-btn-primary px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2"
            data-testid="invoice-print"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>

        {/* Invoice card */}
        <div
          className="print-page max-w-3xl mx-auto bg-white rounded-lg p-10 shadow-2xl"
          data-testid="invoice-page"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[#E0DAF0] pb-6">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#7A5AA6]">
                Banglzz &amp; Kalyani Covering
              </div>
              <h2 className="text-3xl font-bold mt-1 text-[#1F1F1F]" data-testid="invoice-branch-name">
                {branch?.name || "Branch"}
              </h2>
              {branch?.address && (
                <div className="text-sm text-[#555] mt-1">{branch.address}</div>
              )}
              {branch?.phone && (
                <div className="text-sm text-[#555]">Phone: {branch.phone}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#7A5AA6]">Invoice</div>
              <div
                className="text-2xl font-bold text-[#1F1F1F] mt-1"
                data-testid="invoice-bill-no"
              >
                {booking.bill_no}
              </div>
              <div className="text-xs text-[#555] mt-1">
                Date: {formatDate(booking.booking_date)}
              </div>
              <div
                className={`mt-2 inline-block text-[10px] uppercase tracking-widest px-2 py-1 rounded-full ${
                  booking.status === "Returned"
                    ? "bg-[#E8F3EE] text-[#1C4A32]"
                    : booking.status === "Delivered"
                    ? "bg-[#E8EDF2] text-[#142945]"
                    : "bg-[#FDF6E3] text-[#7A5C00]"
                }`}
              >
                {booking.status}
              </div>
            </div>
          </div>

          {/* Customer + product */}
          <div className="grid grid-cols-2 gap-8 py-6 border-b border-[#E0DAF0]">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-[#7A5AA6]">
                Billed to
              </div>
              <div className="font-semibold text-[#1F1F1F] mt-1">
                {booking.customer?.name}
              </div>
              <div className="text-sm text-[#555]">{booking.customer?.phone}</div>
              {booking.customer?.address && (
                <div className="text-sm text-[#555] mt-1">{booking.customer.address}</div>
              )}
              {booking.customer?.id_proof && (
                <div className="text-xs text-[#777] mt-2">
                  ID: {booking.customer.id_proof}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-[#7A5AA6]">
                Item
              </div>
              <div className="font-semibold text-[#1F1F1F] mt-1">
                {booking.product_code}
                {booking.product_name && (
                  <span className="font-normal text-[#555]"> — {booking.product_name}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs text-[#555]">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#7A5AA6]">
                    Booking
                  </div>
                  <div className="text-[#1F1F1F]">{formatDate(booking.booking_date)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#7A5AA6]">
                    Delivery
                  </div>
                  <div className="text-[#1F1F1F]">{formatDate(booking.delivery_date)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#7A5AA6]">
                    Return
                  </div>
                  <div className="text-[#1F1F1F]">{formatDate(booking.return_date)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Amounts table */}
          <div className="py-6">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Rental Amount" value={formatINR(booking.rental_amount)} />
                <Row label="Total Advance Amount" value={formatINR(booking.total_advance)} />
                <Row label="Advance Paid" value={formatINR(booking.advance_paid)} />
                <Row
                  label="Balance Due from Customer"
                  value={formatINR(booking.customer_to_be_paid)}
                />
                <Row
                  label="Refundable Amount to Customer"
                  value={formatINR(booking.return_to_be_paid_to_customer)}
                />
                <tr className="border-t-2 border-[#1F1F1F]">
                  <td className="py-3 font-bold text-[#1F1F1F]">Rental balance (Rental − Advance Paid)</td>
                  <td className="py-3 text-right font-bold text-lg text-[#1F1F1F]">
                    {formatINR(rentalDue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {booking.notes && (
            <div className="border-t border-[#E0DAF0] pt-4">
              <div className="text-[10px] tracking-[0.25em] uppercase text-[#7A5AA6]">Notes</div>
              <div className="text-sm text-[#555] mt-1 whitespace-pre-wrap">{booking.notes}</div>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-[#E0DAF0] flex items-end justify-between text-xs text-[#777]">
            <div>
              <div className="font-medium text-[#1F1F1F]">Thank you for your business.</div>
              <div className="mt-1">
                Please return the jewellery on or before {formatDate(booking.return_date)}.
              </div>
            </div>
            <div className="text-right">
              <div className="border-t border-[#1F1F1F] w-40 mt-12 pt-1 text-center">
                Authorised Signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const Row = ({ label, value }) => (
  <tr className="border-b border-[#F0EDF9]">
    <td className="py-2 text-[#555]">{label}</td>
    <td className="py-2 text-right text-[#1F1F1F] font-medium">{value}</td>
  </tr>
);
