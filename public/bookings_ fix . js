async function submitBooking(e){
  e.preventDefault();
  const btn=document.getElementById('bookingSubmit');
  const form=document.getElementById('bookingForm');
  btn.disabled=true;btn.textContent='Sending…';
  const data={
    fullName:form.fullName.value,email:form.email.value,
    phone:form.phone.value,eventDate:form.eventDate.value,
    eventType:form.eventType.value,county:form.county.value,
    venue:form.venue.value,additional:form.additional?form.additional.value:'',
  };
  try{
    const r=await fetch('/api/booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const d=await r.json();
    if(r.ok&&d.success){
      document.getElementById('bookingFormContent').style.display='none';
      document.getElementById('bookingSuccess').classList.add('show');
      toast("Booking sent! We'll contact you within 24 hours.",'success');
    } else {
      btn.disabled=false;btn.textContent='Send Booking Request';
      toast(d.error||'Something went wrong. Please try again.');
    }
  } catch(err){
    btn.disabled=false;btn.textContent='Send Booking Request';
    toast('Network error — please check your connection and try again.');
  }
}

async function submitInquiry(e){
  e.preventDefault();
  const btn=e.target.querySelector('button[type=submit]');
  const form=e.target;
  btn.disabled=true;btn.textContent='Sending…';
  const data={
    inqName:form.inqName.value,inqEmail:form.inqEmail.value,
    inqPhone:form.inqPhone?form.inqPhone.value:'',
    inqSubject:form.inqSubject.value,inqMessage:form.inqMessage.value,
  };
  try{
    const r=await fetch('/api/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const d=await r.json();
    if(r.ok&&d.success){
      document.getElementById('inquiryFormContent').style.display='none';
      document.getElementById('inquirySuccess').classList.add('show');
      toast("Enquiry sent! We'll reply within 24 hours.",'success');
    } else {
      btn.disabled=false;btn.textContent='Send Enquiry';
      toast(d.error||'Something went wrong. Please try again.');
    }
  } catch(err){
    btn.disabled=false;btn.textContent='Send Enquiry';
    toast('Network error — please check your connection and try again.');
  }
}
