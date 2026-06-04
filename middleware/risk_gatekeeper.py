import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Risk_Gatekeeper")

class RiskGatekeeper:
    def __init__(self):
        # Layer 4 Firewalls
        self.max_risk_per_trade = 0.01  # 1% strict constraint
        self.max_daily_drawdown = 0.05  # 5% max global
        self.current_daily_drawdown = 0.0
        
    def validate_trade(self, signal, account_data):
        """
        Validates trade execution against hard rules, overriding agent model errors.
        """
        try:
            balance = account_data.get('balance', 0)
            
            if balance <= 0:
                logger.error("Account balance is 0 or negative. Trade rejected.")
                return False, "Invalid account balance geometry."
                
            entry = signal.get('entry')
            stop_loss = signal.get('stop_loss')
            lot_size = signal.get('lot_size')
            symbol = signal.get('symbol')
            
            if not all([entry, stop_loss, lot_size, symbol]):
                logger.error("Signal missing required risk geometric parameters.")
                return False, "Malformed signal payload"
            
            # Simplified generic risk geometric calculation
            risk_amount = abs(entry - stop_loss) * lot_size * 100000 
            risk_pct = risk_amount / balance
            
            # Firewalls
            if risk_pct > self.max_risk_per_trade:
                logger.error(f"Trade risk {risk_pct*100:.2f}% exceeds hardcoded 1% max firewall. OVERRIDE REJECT.")
                return False, f"Risk {risk_pct*100:.2f}% > 1% constraint"
                
            if self.current_daily_drawdown > self.max_daily_drawdown:
                logger.error("Max daily drawdown constraint breached. Rejecting.")
                return False, "Daily DD exceeded"
                
            logger.info(f"Trade payload for {symbol} passed risk gatekeeper validation.")
            return True, "Approved payload"
            
        except Exception as e:
            logger.error(f"Critical error in risk validation framework: {e}")
            return False, "System error in validation module"
