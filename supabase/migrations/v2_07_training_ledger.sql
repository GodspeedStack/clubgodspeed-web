-- Create ENUM for package status
CREATE TYPE package_status AS ENUM ('Active', 'Completed');

-- Table: training_packages
CREATE TABLE public.training_packages (
    package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    purchaser_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_hours NUMERIC(5, 2) NOT NULL DEFAULT 0,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status package_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: training_sessions
CREATE TABLE public.training_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.training_packages(package_id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    hours_used NUMERIC(5, 2) NOT NULL DEFAULT 0,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    coaches TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger Function: Auto-Close Rule
CREATE OR REPLACE FUNCTION check_package_completion()
RETURNS TRIGGER AS $$
DECLARE
    sum_hours NUMERIC;
    pkg_total NUMERIC;
BEGIN
    -- Get the total hours used for this package
    SELECT COALESCE(SUM(hours_used), 0) INTO sum_hours
    FROM public.training_sessions
    WHERE package_id = NEW.package_id;

    -- Get the package total hours
    SELECT total_hours INTO pkg_total
    FROM public.training_packages
    WHERE package_id = NEW.package_id;

    -- Update package status if hours hit the total
    IF sum_hours >= pkg_total THEN
        UPDATE public.training_packages
        SET status = 'Completed'
        WHERE package_id = NEW.package_id;
    ELSE
        UPDATE public.training_packages
        SET status = 'Active'
        WHERE package_id = NEW.package_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Auto-Close
CREATE TRIGGER trg_check_package_completion
AFTER INSERT OR UPDATE OR DELETE ON public.training_sessions
FOR EACH ROW
EXECUTE FUNCTION check_package_completion();

-- RLS Policies
ALTER TABLE public.training_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own training packages"
    ON public.training_packages FOR SELECT
    USING (auth.uid() = purchaser_id OR auth.uid() = player_id);

CREATE POLICY "Users can view their own training sessions"
    ON public.training_sessions FOR SELECT
    USING (auth.uid() = player_id OR 
           auth.uid() IN (SELECT purchaser_id FROM public.training_packages WHERE package_id = training_sessions.package_id));
