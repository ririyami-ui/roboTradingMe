// src/components/Portfolio.jsx
import React, { useState } from "react";
import { supabase } from "../supabase";

export default function Portfolio({ user }) {
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");

  async function addAsset(e) {
    e.preventDefault();
    if (!user) return alert("Login dulu");

    const { error } = await supabase
      .from('portfolios')
      .insert({
        uid: user.id,
        symbol,
        amount: Number(amount)
      });

    if (error) {
      console.error("Error adding asset:", error);
      alert("Gagal menambah asset");
    } else {
      setSymbol(""); setAmount("");
    }
  }

  return (
    <div>
      <h3>Portfolio</h3>
      <form onSubmit={addAsset}>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="bitcoin" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount" />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
